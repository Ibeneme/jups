const express = require("express");
const axios = require("axios");
const verifyToken = require("../utils/verifyToken");
const ProductionOrder = require("../models/ProductionOrder");
const Payment = require("../models/Payment");
const Notification = require("../models/Notification"); // 👈 Added for history storage
const notifyUser = require("../utils/notifyUser");

const router = express.Router();

const PAYSTACK_SECRET_KEY =
  process.env.PAYSTACK_SECRET_KEY ||
  "sk_test_7e5775d5f5b96bd8db3aef8b8d39caa0b5228d97";
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

const log = (...args) => {
  const now = new Date().toLocaleString("en-NG", { timeZone: "Africa/Lagos" });
  console.log(`[${now} | NG]`, ...args);
};

// ───── POST: Initialize Payment ─────
router.post("/pay", verifyToken, async (req, res) => {
  log("Initializing payment request...");
  try {
    const { orderId, amount } = req.body;
    const user = req.user;

    console.log(
      `[Pay/Init] OrderID: ${orderId}, Amount: ${amount}, User: ${user.email}`
    );

    if (!orderId || !amount || amount <= 0) {
      console.warn("[Pay/Init] Validation failed: Missing orderId or amount");
      return res.status(400).json({ error: "Missing orderId or valid amount" });
    }

    const order = await ProductionOrder.findById(orderId);
    if (!order) {
      console.error("[Pay/Init] Order not found in database.");
      return res.status(404).json({ error: "Order not found" });
    }

    const reference = `prod_pay_${Date.now()}_${Math.random()
      .toString(36)
      .substring(2, 9)}`;
    const callback_url = `${FRONTEND_URL}/verify-production-order?trxref=${reference}`;

    console.log(`[Pay/Init] Generated Reference: ${reference}`);

    const payload = {
      email: user.email,
      amount: Math.round(amount * 100), // Paystack expects Kobo
      currency: "NGN",
      reference,
      callback_url,
    };

    console.log("[Pay/Init] Calling Paystack API...");
    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      payload,
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("[Pay/Init] Creating pending payment record...");
    await Payment.create({
      user: user._id,
      orderId: order._id,
      amountPaidNGN: Number(amount),
      paymentReference: reference,
      paymentStatus: "pending",
    });

    console.log("[Pay/Init] Success. Returning checkout URL.");
    res.status(200).json({
      success: true,
      checkout_url: response.data.data.authorization_url,
      reference,
      orderId: order._id,
    });
  } catch (error) {
    console.error("[Pay/Init] FATAL ERROR:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ───── GET: Verify Payment ─────
router.get("/verify/:reference", verifyToken, async (req, res) => {
  const { reference } = req.params;
  console.log("--------------------------------------------------");
  console.log(`[VERIFY START] Reference: ${reference}`);
  console.log("--------------------------------------------------");

  try {
    if (!reference) {
      console.warn("[Verify] ❌ No reference provided in params.");
      return res.status(400).json({ error: "Missing reference" });
    }

    console.log("[Verify] Checking database for payment record...");
    const paymentRecord = await Payment.findOne({
      paymentReference: reference,
    });

    if (!paymentRecord) {
      console.error(
        `[Verify] ❌ Reference ${reference} not found in Payment collection.`
      );
      return res.status(404).json({ error: "Payment record not found" });
    }

    console.log(
      `[Verify] Found Record. Current Status in DB: ${paymentRecord.paymentStatus}`
    );

    if (
      paymentRecord.paymentStatus === "paid" ||
      paymentRecord.paymentStatus === "success"
    ) {
      console.log(
        "[Verify] ✅ Transaction already verified in DB. Skipping Paystack API call."
      );
      const order = await ProductionOrder.findById(paymentRecord.orderId);
      return res
        .status(200)
        .json({ success: true, message: "Already verified", order });
    }

    console.log("[Verify] 🛰️ Requesting verification from Paystack API...");
    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
      }
    );

    const paymentData = response.data.data;
    console.log(`[Verify] Paystack API Response Status: ${paymentData.status}`);

    if (paymentData.status !== "success") {
      console.warn(
        `[Verify] ⚠️ Paystack reported status: ${paymentData.status}. Terminating.`
      );
      return res
        .status(400)
        .json({ success: false, error: "Transaction failed" });
    }

    console.log("[Verify] Fetching linked Production Order...");
    const order = await ProductionOrder.findById(paymentRecord.orderId);
    if (!order) {
      console.error(`[Verify] ❌ Order ${paymentRecord.orderId} not found.`);
      return res.status(404).json({ error: "Order not found" });
    }

    const amountPaidInThisTrx = paymentData.amount / 100;
    console.log(`[Verify] 💰 Amount Paid in this TRX: ₦${amountPaidInThisTrx}`);
    console.log(
      `[Verify] Order Pre-update: Paid=₦${order.amountPaid}, Balance=₦${order.balanceRemaining}`
    );

    // Status Transition Logic
    if (order.amountPaid === 0 || order.status === "pending") {
      console.log(
        "[Verify] 🆕 First payment detected. Transitioning order to 'in_progress'."
      );
      order.status = "in_progress";
      order.duration = "5 days";
      order.createdAt = new Date();

      // ─── TIMELINE CALCULATION: ADD 2 DAYS TO BASE ESTIMATE ───
      if (order.daysToGetReady) {
        const parsedBaseDays = parseInt(order.daysToGetReady, 10);
        if (!isNaN(parsedBaseDays)) {
          // Add 2 days setup premium directly to the base timeline
          const extendedDaysTotal = parsedBaseDays + 2;
          order.daysToGetReady = `${extendedDaysTotal} days`;
          console.log(
            `[Verify] 🗓️ Timeline extended with 2-day buffer. New Base: ${order.daysToGetReady}`
          );
        }
      }
    }

    order.amountPaid += amountPaidInThisTrx;
    order.balanceRemaining -= amountPaidInThisTrx;
    if (order.balanceRemaining < 0) order.balanceRemaining = 0;

    if (order.balanceRemaining <= 0) {
      console.log("[Verify] 🏆 Order now FULLY PAID.");
      order.paymentStatus = "paid";
      order.isFullPaid = true;
      order.isInstalmentPaid = false;
    } else {
      console.log(
        `[Verify] 💵 Partial payment. New Balance: ₦${order.balanceRemaining}`
      );
      order.paymentStatus = "partial";
      order.isInstalment = true;
      order.isInstalmentPaid = true;
    }

    order.paidAt = new Date(paymentData.paid_at);
    order.paymentReference = reference;

    console.log("[Verify] Saving Order and Payment updates to DB...");
    await order.save();

    paymentRecord.paymentStatus = "paid";
    paymentRecord.paymentDetails = paymentData;
    paymentRecord.paidAt = new Date(paymentData.paid_at);
    await paymentRecord.save();
    console.log("[Verify] DB Update Successful.");

    // 🚀 NOTIFICATION LOGIC
    const isFullPayment = order.balanceRemaining <= 0;
    const notificationTitle = "Payment Received!";
    const notificationBody = isFullPayment
      ? `Payment of ₦${amountPaidInThisTrx.toLocaleString()} was successful. Your order is now fully paid and our team is finalizing production!`
      : `Payment of ₦${amountPaidInThisTrx.toLocaleString()} confirmed. Your remaining balance is ₦${order.balanceRemaining.toLocaleString()}.`;

    console.log(`[Notification] Creating history for user: ${order.user}`);
    await Notification.create({
      user: order.user,
      title: notificationTitle,
      description: notificationBody,
      orderId: order._id,
      type: "ORDER_PAID",
      metadata: {
        amount: amountPaidInThisTrx,
        reference: reference,
        balanceLeft: order.balanceRemaining,
      },
    });

    console.log("[Notification] Sending real-time push alert...");
    await notifyUser({
      userId: order.user,
      title: notificationTitle,
      description: notificationBody,
      orderId: order._id,
      type: "ORDER_PAID",
    });

    console.log(
      `[VERIFY COMPLETE] ✅ Order ${order._id} status is now: ${order.status}`
    );
    console.log("--------------------------------------------------");

    res.status(200).json({ success: true, message: "Payment verified", order });
  } catch (error) {
    console.error("--------------------------------------------------");
    console.error("[VERIFY CRASH] ❌ Error stack below:");
    console.error(error);
    console.error("--------------------------------------------------");
    res.status(500).json({ success: false, error: "Verification failed" });
  }
});

module.exports = router;

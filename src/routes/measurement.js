const express = require("express");
const axios = require("axios");
const router = express.Router();
const verifyToken = require("../utils/verifyToken");
const OnsiteMeasurement = require("../models/RequestOnsite");
const Payment = require("../models/Payment");
const notifyUser = require("../utils/notifyUser");

const PAYSTACK_SECRET_KEY =
  process.env.PAYSTACK_SECRET_KEY ||
  "sk_test_7e5775d5f5b96bd8db3aef8b8d39caa0b5228d97";
const MAPPING_FEE = 20000;

router.post("/request", verifyToken, async (req, res) => {
  try {
    const {
      address,
      description,
      phoneNumber,
      preferredSchedule,
      alternativeSchedule,
    } = req.body;
    const user = req.user;

    if (
      !address ||
      !description ||
      !phoneNumber ||
      !preferredSchedule?.date ||
      !alternativeSchedule?.date
    ) {
      return res
        .status(400)
        .json({ error: "Missing required scheduling fields." });
    }

    const reference = `meas_${Date.now()}_${Math.random()
      .toString(36)
      .substring(2, 7)}`;

    const measurementRequest = await OnsiteMeasurement.create({
      userId: user._id,
      customerName: `${user.firstName} ${user.lastName}`,
      phoneNumber,
      address,
      description,
      amount: MAPPING_FEE,
      paymentReference: reference,
      preferredSchedule: {
        date: new Date(preferredSchedule.date),
        time: preferredSchedule.time,
      },
      alternativeSchedule: {
        date: new Date(alternativeSchedule.date),
        time: alternativeSchedule.time,
      },
    });

    const payload = {
      email: user.email,
      amount: MAPPING_FEE * 100,
      reference,
      callback_url: `${process.env.FRONTEND_URL}/verify-measurement?ref=${reference}`,
      metadata: {
        type: "ONSITE_MEASUREMENT",
        measurementId: measurementRequest._id,
      },
    };

    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      payload,
      {
        headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
      }
    );

    await Payment.create({
      user: user._id,
      orderId: measurementRequest._id,
      amountPaidNGN: MAPPING_FEE,
      paymentReference: reference,
      paymentStatus: "pending",
    });

    res.status(200).json({
      success: true,
      checkout_url: response.data.data.authorization_url,
      reference,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get("/verify/:reference", verifyToken, async (req, res) => {
  const { reference } = req.params;

  try {
    // Check if already processed
    const existing = await OnsiteMeasurement.findOne({
      paymentReference: reference,
    });
    if (existing && existing.status === "scheduled") {
      return res.status(200).json({ success: true, measurement: existing });
    }

    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      {
        headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
      }
    );

    const paymentData = response.data.data;

    if (paymentData.status === "success") {
      const measurement = await OnsiteMeasurement.findOneAndUpdate(
        { paymentReference: reference },
        { status: "scheduled", paidAt: new Date(paymentData.paid_at) },
        { new: true }
      );

      await Payment.findOneAndUpdate(
        { paymentReference: reference },
        { paymentStatus: "paid", paidAt: new Date(paymentData.paid_at) }
      );

      await notifyUser({
        userId: measurement.userId,
        title: "Measurement Scheduled! ✅",
        description: `Payment confirmed. Our team will contact you shortly.`,
        type: "MEASUREMENT_PAID",
      });

      return res.status(200).json({ success: true, measurement });
    }

    res.status(400).json({ success: false, message: "Payment incomplete" });
  } catch (error) {
    res.status(500).json({ error: "Verification failed" });
  }
});

// ───── GET: Get All User Measurement Requests ─────
router.get("/my-requests", verifyToken, async (req, res) => {
  try {
    const requests = await OnsiteMeasurement.find({
      userId: req.user._id,
    }).sort({ createdAt: -1 });

    const stats = {
      total: requests.length,
      pending: requests.filter((r) => r.status === "pending_payment").length,
      scheduled: requests.filter((r) => r.status === "scheduled").length,
      completed: requests.filter((r) => r.status === "completed").length,
    };

    res.status(200).json({
      success: true,
      count: requests.length,
      stats,
      data: requests,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});


// ───── PATCH: Mark Onsite Measurement as Completed ─────
router.patch("/complete/:id", async (req, res) => {
    try {
      const { id } = req.params;
  
      // 1. Find the request
      const measurement = await OnsiteMeasurement.findById(id);
  
      if (!measurement) {
        return res.status(404).json({ success: false, error: "Request not found." });
      }
  
      // 2. Strict validation: Only 'scheduled' can move to 'completed'
      if (measurement.status !== "scheduled") {
        return res.status(400).json({ 
          success: false, 
          error: `Cannot complete request. Current status is '${measurement.status}', but it must be 'scheduled'.` 
        });
      }
  
      // 3. Update status
      measurement.status = "completed";
      measurement.completedAt = new Date(); // Good for records
      await measurement.save();
  
      // 4. Notify the user
      await notifyUser({
        userId: measurement.userId,
        title: "Measurement Completed! 📐",
        description: `Your onsite measurement for ${measurement.address} has been marked as completed.`,
        type: "MEASUREMENT_COMPLETED",
      });
  
      res.status(200).json({
        success: true,
        message: "Status updated to completed.",
        data: measurement,
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

module.exports = router;

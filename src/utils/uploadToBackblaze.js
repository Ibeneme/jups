const B2 = require("backblaze-b2");

const applicationKeyId = process.env.APPLICATION_KEY_ID;
const applicationKey = process.env.APPLICATION_KEY;
const bucketId = process.env.BUCKET_ID;
const bucketName = process.env.BUCKET_NAME;


async function uploadToBackblaze(fileBuffer, originalName, folder = "uploads") {
  console.log("➡️ uploadToBackblaze called");
  console.log(
    "🔹 fileBuffer type:",
    Buffer.isBuffer(fileBuffer),
    "length:",
    fileBuffer.length
  );
  console.log("🔹 originalName:", originalName);
  console.log("🔹 folder:", folder);

  try {
    const b2 = new B2({
      applicationKeyId,
      applicationKey,
    });

    console.log("🔑 Authorizing B2...");
    await b2.authorize();
    console.log("✅ B2 authorized");

    const { data: uploadData } = await b2.getUploadUrl({ bucketId });
    console.log("📦 Upload URL retrieved");

    const timestamp = Date.now();
    const safeName = originalName.replace(/\s+/g, "_");
    const fileName = `${folder}/${timestamp}_${safeName}`;

    const { data: uploadedData } = await b2.uploadFile({
      uploadUrl: uploadData.uploadUrl,
      uploadAuthToken: uploadData.authorizationToken,
      fileName,
      data: fileBuffer,
    });

    console.log("✅ File uploaded:", uploadedData.fileName);

    return `https://f005.backblazeb2.com/file/${bucketName}/${uploadedData.fileName}`;
  } catch (error) {
    console.error("❌ B2 Upload Error:", error.response || error);
    throw new Error(
      `Failed to upload file to Backblaze B2: ${error.message || error}`
    );
  }
}

module.exports = { uploadToBackblaze };

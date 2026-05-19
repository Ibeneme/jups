const express = require("express");
const router = express.Router();
const multer = require("multer");
const InteriorDecoratorProject = require("../../models/Interior_Designer/InteriorDecoratorProject");
const InteriorDesigner = require("../../models/Interior_Designer/InteriorDesigner");
const { uploadToBackblaze } = require("../../utils/uploadToBackblaze");

// Memory storage is essential for piping buffers directly to Backblaze
const upload = multer({ storage: multer.memoryStorage() });

// --- 1. FETCH DESIGNER HISTORY ---
router.get("/history/:designerId", async (req, res) => {
  try {
    const projects = await InteriorDecoratorProject.find({
      designerId: req.params.designerId,
    })
      .populate({ path: "designerId", model: "InteriorDesigner" })
      .sort({ createdAt: -1 });

    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- 2. FETCH PROJECT DETAIL ---
router.get("/detail/:projectId", async (req, res) => {
  try {
    const project = await InteriorDecoratorProject.findById(
      req.params.projectId
    ).populate({ path: "designerId", model: "InteriorDesigner" });

    if (!project)
      return res.status(404).json({ message: "Project not found." });
    res.json(project);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- 3. ADD NEW PROJECT ---
router.post("/add", upload.array("referenceImages", 10), async (req, res) => {
  try {
    const {
      designerId,
      projectName,
      projectType,
      deliveryCity,
      finalSpecifications,
    } = req.body;
    const referenceUrls = [];

    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const url = await uploadToBackblaze(
          file.buffer,
          file.originalname,
          "reference-designs"
        );
        referenceUrls.push(url);
      }
    }

    const newProject = new InteriorDecoratorProject({
      designerId,
      projectName,
      projectType,
      deliveryCity,
      finalSpecifications,
      referenceImages: referenceUrls,
    });

    await newProject.save();
    res.status(201).json(newProject);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- 4. EDIT PROJECT (Full Gallery Management) ---
router.put(
  "/edit/:projectId",
  upload.array("referenceImages", 10),
  async (req, res) => {
    try {
      const {
        projectName,
        projectType,
        deliveryCity,
        finalSpecifications,
        deliveryStatus,
        existingImages,
      } = req.body;

      const project = await InteriorDecoratorProject.findById(
        req.params.projectId
      );
      if (!project)
        return res.status(404).json({ message: "Project not found" });

      // Manage Gallery: Keep selected old images + Add new uploads
      let updatedReferenceImages = [];
      if (existingImages) {
        updatedReferenceImages =
          typeof existingImages === "string"
            ? JSON.parse(existingImages)
            : existingImages;
      } else {
        updatedReferenceImages =
          req.files?.length > 0 ? [] : project.referenceImages;
      }

      if (req.files && req.files.length > 0) {
        for (const file of req.files) {
          const url = await uploadToBackblaze(
            file.buffer,
            file.originalname,
            "reference-designs"
          );
          updatedReferenceImages.push(url);
        }
      }

      const updatedProject = await InteriorDecoratorProject.findByIdAndUpdate(
        req.params.projectId,
        {
          $set: {
            projectName: projectName || project.projectName,
            projectType: projectType || project.projectType,
            deliveryCity: deliveryCity || project.deliveryCity,
            finalSpecifications:
              finalSpecifications || project.finalSpecifications,
            deliveryStatus: deliveryStatus || project.deliveryStatus,
            referenceImages: updatedReferenceImages,
          },
        },
        { new: true }
      ).populate({ path: "designerId", model: "InteriorDesigner" });

      res.json(updatedProject);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// --- 5. ASSET VAULT UPLOAD ---
router.post(
  "/:projectId/upload-vault",
  upload.fields([
    { name: "photos", maxCount: 20 },
    { name: "videos", maxCount: 5 },
  ]),
  async (req, res) => {
    try {
      const project = await InteriorDecoratorProject.findById(
        req.params.projectId
      );
      if (!project)
        return res.status(404).json({ message: "Project not found" });

      if (req.files["photos"]) {
        for (const file of req.files["photos"]) {
          const url = await uploadToBackblaze(
            file.buffer,
            file.originalname,
            `vault/${project.projectId}/photos`
          );
          project.assetVault.productPhotos.push(url);
        }
      }

      if (req.files["videos"]) {
        for (const file of req.files["videos"]) {
          const url = await uploadToBackblaze(
            file.buffer,
            file.originalname,
            `vault/${project.projectId}/videos`
          );
          project.assetVault.productionVideos.push(url);
        }
      }

      await project.save();
      res.json({ success: true, assetVault: project.assetVault });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);

// --- 6. DELETE PROJECT ---
router.delete("/delete/:projectId", async (req, res) => {
  try {
    await InteriorDecoratorProject.findByIdAndDelete(req.params.projectId);
    res.json({ success: true, message: "Project deleted." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

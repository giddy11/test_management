// infrastructure/storage/cloudinaryClient.js
// The ONLY place cloudinary.config() is called. Everything else imports this instance.
const { v2: cloudinary } = require("cloudinary");
const { env } = require("../../config/env");

cloudinary.config({
  cloud_name: env.cloudinary.cloudName,
  api_key: env.cloudinary.apiKey,
  api_secret: env.cloudinary.apiSecret,
  secure: true,
});

module.exports = { cloudinary };

const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1, fields: 10 },
}).single('file');

module.exports = (req, res, next) => upload(req, res, (error) => {
  if (!error) return next();
  const tooLarge = error.code === 'LIMIT_FILE_SIZE';
  return res.status(tooLarge ? 413 : 400).json({
    success: false,
    message: tooLarge ? 'Ukuran file maksimal 20 MB' : 'Unggahan file tidak valid',
  });
});

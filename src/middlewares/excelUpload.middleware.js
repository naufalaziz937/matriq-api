const multer = require('multer');

const ALLOWED_MIMETYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/octet-stream', // fallback beberapa browser/OS
];
const ALLOWED_EXTENSIONS = ['.xlsx'];

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const originalName = (file.originalname || '').toLowerCase();
  const hasValidExt = ALLOWED_EXTENSIONS.some((ext) => originalName.endsWith(ext));
  if (hasValidExt && ALLOWED_MIMETYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Format file harus Excel (.xlsx)'), false);
  }
};

const excelUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter,
});

module.exports = function uploadExcel(req, res, next) {
  excelUpload.single('file')(req, res, (error) => {
    if (!error) return next();
    const message = error.code === 'LIMIT_FILE_SIZE'
      ? 'Ukuran file maksimal 5 MB'
      : error.message || 'File Excel tidak dapat diunggah';
    return res.status(400).json({ success: false, message });
  });
};

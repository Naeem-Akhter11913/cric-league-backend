const multer = require("multer");

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
        if (
            file.mimetype === 'text/csv' ||
            file.mimetype === 'application/vnd.ms-excel' ||
            file.originalname.toLowerCase().endsWith('.csv')
        ) {
            cb(null, true);
        } else {
            cb(new Error('Only CSV files are allowed'));
        }
    },
});

// Use as middleware: router.post('/venues/bulk-upload', upload.single('file'), bulkUploadVenues)
exports.uploadMiddleware = upload.single('file');
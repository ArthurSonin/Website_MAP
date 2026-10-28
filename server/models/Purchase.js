const mongoose = require('mongoose');

const purchaseSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    appId: {
        type: String,
        required: true
    },
    appName: {
        type: String,
        required: true
    },
    version: {
        type: String,
        default: 'v1.0'
    },
    fileUrl: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'success', 'cancelled'],
        default: 'pending'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// TTL Індекс: автоматично видаляє документи зі статусом 'pending' через 24 години (86400 секунд)
purchaseSchema.index(
    { createdAt: 1 }, 
    { 
        expireAfterSeconds: 86400, 
        partialFilterExpression: { status: 'pending' } // Видаляє ТІЛЬКИ ті, які не були оплачені
    }
);

module.exports = mongoose.model('Purchase', purchaseSchema);
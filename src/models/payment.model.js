const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
    razorpayPaymentId: {
        type: String,
        required: true,
        trim: true,
        unique: true
    },
    razorpayOrderId: {
        type: String,
        required: true,
        trim: true
    },
    status: {
        type: String,
        enum: ['pending', 'completed'],
        default: 'pending',
        required: true,
        trim: true
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Payment', paymentSchema);

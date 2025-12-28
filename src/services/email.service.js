const nodemailer = require('nodemailer');

const sendEmail = async (to, subject, text) => {
    try {
        // Create Transporter
        // Ideally, use environment variables
        const transporter = nodemailer.createTransport({
            service: 'gmail', // or use host/port
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS.replace(/\s+/g, '') // Remove spaces from App Password
            }
        });

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to,
            subject,
            text
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('Email sent: ' + info.response);
        return info;
    } catch (error) {
        console.error('Error sending email:', error);
        throw new Error('Email functionality failed');
    }
};

module.exports = { sendEmail };

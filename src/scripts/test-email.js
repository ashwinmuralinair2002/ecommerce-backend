require('dotenv').config();
const nodemailer = require('nodemailer');

const targetEmail = process.argv[2];

if (!targetEmail) {
    console.error('Usage: node src/scripts/test-email.js <recipient-email>');
    process.exit(1);
}

console.log('--- Email Delivery Test Script ---');
console.log(`from: ${process.env.EMAIL_USER}`);
console.log(`to:   ${targetEmail}`);

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS ? process.env.EMAIL_PASS.replace(/\s+/g, '') : undefined
    }
});

const mailOptions = {
    from: process.env.EMAIL_USER,
    to: targetEmail,
    subject: 'SoundWave Test Email - Direct Verification',
    text: `This is a test email sent directly from the server script at ${new Date().toISOString()}. If you received this, your credentials and network allow sending emails.`
};

(async () => {
    try {
        console.log('Attempting to send...');
        const info = await transporter.sendMail(mailOptions);
        console.log('✅ Send successful!');
        console.log('Response:', info.response);
        console.log('MessageID:', info.messageId);

        if (process.env.EMAIL_USER === targetEmail) {
            console.warn('\n⚠️  WARNING: You are sending an email to yourself.');
            console.warn('   Gmail often hides these messages from the Inbox. Check "Sent Mail" or "All Mail".');
        } else {
            console.log('\nℹ️  Check your Inbox and Spam folder now.');
        }

    } catch (error) {
        console.error('❌ Send FAILED.');
        console.error(error);
    }
})();

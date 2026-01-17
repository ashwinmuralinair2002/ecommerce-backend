// Home page controller for public and authenticated views
// Public Landing Page
exports.getHomePage = (req, res) => {
    // If user is already logged in and verified, strictly redirect to /home?
    // Or allow them to see landing page? 
    // Requirement says: "The root route / MUST ALWAYS render the Landing Page"
    // So we just render it.
    res.render('user/home', { user: req.user });
};

// Protected Dashboard / Feed
exports.getPostLoginHomePage = (req, res) => {
    // User is guaranteed to be authenticated and verified by middleware
    res.render('user/post-login-home', { user: req.user });
};

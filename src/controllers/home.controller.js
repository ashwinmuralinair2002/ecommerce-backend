exports.getHomePage = (req, res) => {
    res.render('user/home');
};

exports.getPostLoginHomePage = (req, res) => {
    res.render('user/post-login-home');
};

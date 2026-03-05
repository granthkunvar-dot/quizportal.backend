
exports.requireAdmin = (req, res, next) => {
    const user = req.user || req.session?.user;
    if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
        return res.status(403).json({ message: "Admin access required." });
    }
    next();
};

exports.requireSuperAdmin = (req, res, next) => {
    const user = req.user || req.session?.user;
    if (!user || user.role !== 'super_admin') {
        return res.status(403).json({ message: "Super Admin access required." });
    }
    next();
};

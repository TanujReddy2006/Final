import jwt from 'jsonwebtoken';

const secret = process.env.JWT_SECRET || 'change-this-demo-secret';

export const signToken = user =>
  jwt.sign(
    {
      id: user.id,
      role: user.role,
      companyId: user.companyId
    },
    secret,
    { expiresIn: '8h' }
  );

export function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }

  try {
    req.user = jwt.verify(header.slice(7), secret);
    next();
  } catch {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired session'
    });
  }
}

export const allow = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) {
    return res.status(403).json({
      success: false,
      message: 'Insufficient permissions'
    });
  }
  next();
};

export const publicUser = user => {
  const { passwordHash, ...safe } = user;
  return safe;
};


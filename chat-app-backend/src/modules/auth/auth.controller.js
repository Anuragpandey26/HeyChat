import { AuthService } from './auth.service.js';

const authService = new AuthService();

const setTokenCookies = (res, accessToken, refreshToken) => {
  const isProd = process.env.NODE_ENV === 'production';
  const cookieOptions = {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
  };
  
  if (accessToken) {
    res.cookie('accessToken', accessToken, {
      ...cookieOptions,
      maxAge: 15 * 60 * 1000, // 15 mins
    });
  }

  if (refreshToken) {
    res.cookie('refreshToken', refreshToken, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
  }
};

const clearTokenCookies = (res) => {
  const isProd = process.env.NODE_ENV === 'production';
  const sameSite = isProd ? 'none' : 'lax';
  res.clearCookie('accessToken', { httpOnly: true, secure: isProd, sameSite });
  res.clearCookie('refreshToken', { httpOnly: true, secure: isProd, sameSite });
};

export class AuthController {
  async register(req, res, next) {
    try {
      const user = await authService.register(req.body);
      const tokens = await authService.generateTokens(user.id);
      setTokenCookies(res, tokens.accessToken, tokens.refreshToken);

      res.status(201).json({
        status: 'success',
        message: 'Registration successful',
        data: {
          user,
          accessToken: tokens.accessToken,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  async login(req, res, next) {
    try {
      const { email, password } = req.body;
      const { user, accessToken, refreshToken } = await authService.login(email, password);
      
      setTokenCookies(res, accessToken, refreshToken);

      res.status(200).json({
        status: 'success',
        message: 'Login successful',
        data: {
          user,
          accessToken,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  async refresh(req, res, next) {
    try {
      const token = req.cookies?.refreshToken || req.body?.refreshToken;

      if (!token) {
        return res.status(401).json({
          status: 'fail',
          message: 'Refresh token not found',
        });
      }

      const tokens = await authService.refresh(token);
      setTokenCookies(res, tokens.accessToken, tokens.refreshToken);

      res.status(200).json({
        status: 'success',
        data: {
          accessToken: tokens.accessToken,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  async logout(req, res, next) {
    try {
      const accessToken = req.cookies.accessToken || (req.headers.authorization && req.headers.authorization.split(' ')[1]);
      const refreshToken = req.cookies.refreshToken || req.body.refreshToken;

      await authService.logout(accessToken, refreshToken);
      clearTokenCookies(res);

      res.status(200).json({
        status: 'success',
        message: 'Logged out successfully',
      });
    } catch (err) {
      next(err);
    }
  }

  async verifyRecovery(req, res, next) {
    try {
      const { email, securityAnswer } = req.body;
      const data = await authService.verifySecurityQuestion(email, securityAnswer);

      res.status(200).json({
        status: 'success',
        message: 'Security answer verified',
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  async resetPassword(req, res, next) {
    try {
      const { email, recoveryToken, newPassword, publicKey } = req.body;
      await authService.resetPassword(email, recoveryToken, newPassword, publicKey);

      res.status(200).json({
        status: 'success',
        message: 'Password reset successful',
      });
    } catch (err) {
      next(err);
    }
  }
}

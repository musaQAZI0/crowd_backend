const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const LocalStrategy = require('passport-local').Strategy;
const User = require('../models/User');

module.exports = (passport) => {
  passport.use(new LocalStrategy({
  usernameField: 'email',
  passwordField: 'password'
}, async (email, password, done) => {
  try {
    const user = await User.findByEmailOrUsername(email);
    
    if (!user) {
      return done(null, false, { message: 'Invalid email or password' });
    }

    if (user.accountStatus !== 'active') {
      return done(null, false, { message: 'Account is not active' });
    }

    const isMatch = await user.comparePassword(password);
    
    if (!isMatch) {
      return done(null, false, { message: 'Invalid email or password' });
    }

    user.lastLogin = new Date();
    await user.save();

    return done(null, user);
  } catch (error) {
    return done(error);
  }
}));

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/api/auth/google/callback"
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      let user = await User.findOne({
        $or: [
          { email: profile.emails[0].value },
          { 'googleId': profile.id }
        ]
      });

      if (user) {
        if (!user.googleId) {
          user.googleId = profile.id;
          await user.save();
        }
        user.lastLogin = new Date();
        await user.save();
        return done(null, user);
      }

      user = new User({
        googleId: profile.id,
        email: profile.emails[0].value,
        username: profile.emails[0].value.split('@')[0] + '_' + Math.random().toString(36).substr(2, 5),
        firstName: profile.name.givenName,
        lastName: profile.name.familyName,
        profilePicture: profile.photos[0]?.value || '',
        isVerified: true,
        password: Math.random().toString(36).substr(2, 12),
        lastLogin: new Date()
      });

      await user.save();
      return done(null, user);
    } catch (error) {
      return done(error);
    }
    }));
  }

  if (process.env.FACEBOOK_APP_ID && process.env.FACEBOOK_APP_SECRET) {
    passport.use(new FacebookStrategy({
    clientID: process.env.FACEBOOK_APP_ID,
    clientSecret: process.env.FACEBOOK_APP_SECRET,
    callbackURL: "/api/auth/facebook/callback",
    profileFields: ['id', 'emails', 'name', 'picture.type(large)']
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      let user = await User.findOne({
        $or: [
          { email: profile.emails[0].value },
          { 'facebookId': profile.id }
        ]
      });

      if (user) {
        if (!user.facebookId) {
          user.facebookId = profile.id;
          await user.save();
        }
        user.lastLogin = new Date();
        await user.save();
        return done(null, user);
      }

      user = new User({
        facebookId: profile.id,
        email: profile.emails[0].value,
        username: profile.emails[0].value.split('@')[0] + '_' + Math.random().toString(36).substr(2, 5),
        firstName: profile.name.givenName,
        lastName: profile.name.familyName,
        profilePicture: profile.photos[0]?.value || '',
        isVerified: true,
        password: Math.random().toString(36).substr(2, 12),
        lastLogin: new Date()
      });

      await user.save();
      return done(null, user);
    } catch (error) {
      return done(error);
    }
    }));
  }

  passport.serializeUser((user, done) => {
    done(null, user._id);
  });

  passport.deserializeUser(async (id, done) => {
    try {
      const user = await User.findById(id).select('-password -refreshTokens');
      done(null, user);
    } catch (error) {
      done(error, null);
    }
  });
};
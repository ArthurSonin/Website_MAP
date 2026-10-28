const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User'); // Шлях з папки config до models

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${process.env.BASE_URL || 'http://localhost:5000'}/api/auth/google/callback`,
      proxy: true
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails && profile.emails[0] ? profile.emails[0].value : '';
        const googlePhoto = profile.photos && profile.photos[0] ? profile.photos[0].value : '';

        // 1. Шукаємо за googleId або email
        let user = await User.findOne({ 
          $or: [{ googleId: profile.id }, { email: email }] 
        });

        if (user) {
          // Якщо користувач існує, просто оновлюємо поля без суворої валідації схеми
          let updates = {};
          if (!user.googleId) updates.googleId = profile.id;
          if (!user.avatar && googlePhoto) updates.avatar = googlePhoto;

          if (Object.keys(updates).length > 0) {
            user = await User.findByIdAndUpdate(user._id, { $set: updates }, { new: true });
          }
          return done(null, user);
        }

        // 2. Якщо користувача немає — створюємо нового
        user = await User.create({
          username: profile.displayName || email.split('@')[0],
          email: email,
          googleId: profile.id,
          avatar: googlePhoto,
          isVerified: true
        });

        return done(null, user);
      } catch (err) {
        console.error("Помилка в Google Strategy:", err);
        return done(err, null);
      }
    }
  )
);

module.exports = passport;
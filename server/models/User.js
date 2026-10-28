const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: { 
    type: String, 
    required: true 
  },
  email: { 
    type: String, 
    required: true, 
    unique: true 
  },
  password: { 
    type: String, 
  },
  avatar: { 
    type: String, 
    default: '' 
  },
  googleId: { 
    type: String 
  },
  isVerified: { 
    type: Boolean, 
    default: false 
  },
  
  // Поля для OTP-коду
  verificationCodeHash: { type: String },
  verificationCodeExpires: { type: Date }
}, { timestamps: true });

// Хешування пароля перед збереженням
userSchema.pre('save', async function() {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Перевірка пароля
userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
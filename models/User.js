const { Schema } = require("mongoose")
const mongoose = require("mongoose")
//import bcrypt from "bcrypt"

const userSchema = new Schema({
  type: String,
  verified: { type: Boolean, default: false },
  email: String,
  password: String,
  accountId: { 
    type: Schema.Types.ObjectId, 
    ref: 'Account' 
  },
  verifyId: { 
    type: Schema.Types.ObjectId, 
    ref: 'Verify' 
  },
})

module.exports = mongoose.model("User", userSchema)
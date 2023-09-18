const mongoose = require("mongoose")
const { Schema } = require("mongoose")
//import bcrypt from "bcrypt"

const userAdminSchema = new Schema({
  type: String,
  verified: { type: Boolean, default: false },
  email: String,
  password: String,
  accountId: { 
    type: Schema.Types.ObjectId, 
    ref: 'Account_admin' 
  },
  verifyId: { 
    type: Schema.Types.ObjectId, 
    ref: 'Verify' 
  },
})

/*
userAdminSchema.post('deleteMany', async function(doc, next) {
  try {
    console.log(doc)
    console.log('%s has been removed', doc._id)
    next()
  } 
  catch (err) {
    console.log(err)
  }
});
*/

/*
userAdminSchema.pre('deleteMany', async function(next) {
  try {
    await mongoose.model("Account_admin").deleteMany({ _id: this.getFilter()["accountId"] });
    next()
  } 
  catch (err) {
    console.log(err)
  }
});
*/

module.exports = mongoose.model("Admin", userAdminSchema)
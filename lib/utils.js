const router = require('express').Router();

/** Database functions */
const { getConnection, closeConnectionMongoose } = require("./mongoose/dbConnect");
const { 
  getModel, 
  findOneByEmailMongoose,
  findByIdAndUpdateMongoose,
  createUserCredentialMongoose, 
  createDocumentMongoose,
  createVerificationMongoose,
  findByIdMongoose,
} = require("./mongoose/dbModel");

const { userAdminSchema } = require("../models/UserAdmin");
const { accountAdminSchema } = require("../models/AccountAdmin")

/** Utils */
const axios = require('axios').default;

// Create wrapper function that will adjust router based on provided configuration
const validateSessionSocket = async function ( req ) {
  const { headers } = req;
  let session 

  /** Check headers and cookies for authentication */
  if (!headers.cookie) {
    return false
  }

  try {
    const result = await axios({
      url: `${process.env.USER_AUTH_DOMAIN}/api/auth/session`,
      method: "get",
      headers: {
        'Cookie': headers.cookie,
      }
    })
    session = result.data
  } 
  catch (error) {
    return false
  }

  if ( !session || !session?.user?.verified ) {
    return false
  }
  
  return session
}

/* Returns user permissions */
async function getUserPermissions( id ) {   
  try {    
    let connDb = await getConnection(process.env.DATABASE_NAME)  
    let User = getModel("Admin", userAdminSchema, connDb)
    let Account = getModel("Account_admin", accountAdminSchema, connDb)
    
    let userDoc = await User.findById(id).populate("accountId")
    
    if (userDoc) {
      //console.log(`Found permissions for user: '${id}'`);
      const { superAdmin, permissions } = userDoc.accountId
      
      return {
        superAdmin,
        permissions
      }
    }
    else{
      console.log("No permissions found")
      return false
    } 
  } 
  catch (error) {
    console.log(`Error querying permissions`);
    return false
  }
}

/**
* Send data through sockets
* @param {Server} io Instance of sockets
* @param {String} channel Channel to send data
* @param {String} group Client object key name 
* @param {Object} data 
*/
async function sendDataSocket( io, channel, group, data ){
  return new Promise((resolve, reject) => {
    io.to(channel).timeout(5000).emit("data_list_incoming", group, data, (err, response) => {
      if (err) {
        console.log(err)
        reject(err)
      } else {
        //console.log(response);
        resolve(response);
      }
    });
  });
}

module.exports = {
  validateSessionSocket,
  getUserPermissions,
  sendDataSocket,
};
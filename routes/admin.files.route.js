const router = require('express').Router();

/** Database functions */
const { getConnection, closeConnectionMongoose } = require("../lib/mongoose/dbConnect");
const { 
  getModel, 
  findOneByEmailMongoose,
  findByIdAndUpdateMongoose,
  createUserCredentialMongoose, 
  createDocumentMongoose,
  createVerificationMongoose,
  findByIdMongoose,
} = require("../lib/mongoose/dbModel");
const { userAdminSchema } = require("../models/UserAdmin");
const { accountAdminSchema } = require("../models/AccountAdmin");

/** Utils */
const assert = require("assert")
const multer  = require('multer')
const DatauriParser = require('datauri/parser');
const { uploadImage, deleteImage } = require('../lib/cloudinary')
const { getUserPermissions } = require('../lib/utils')
const { sendDataSocket } = require('../lib/utils')

const storage = multer.memoryStorage()
const upload = multer({ storage: storage })

const dbName = process.env.DATABASE_NAME

// Create wrapper function that will adjust router based on provided configuration
var wrapper = function (io) {
  router.all('/:id/files/?*', upload.any(), async (req, res, next) => {
    const {
      method,
      params: { id },
      body,
      files,
    } = req;    
    let connDb
    let sessionMongo
    let accountId
    
    /** Check super admin */ 
    const { superAdmin } = await getUserPermissions(id)

    switch (method) {
      case "GET":
        return res.status(201).json({success:'success'})
      case "PUT":
        let fieldname 
        try {
          if ( !files || files.length < 1 ) {
            return res.status(401).json({ msg: "Not files detected" });  
          }

          /** Connect to the database */          
          connDb = await getConnection(dbName)
          let User = getModel("Admin", userAdminSchema, connDb)
          let Account = getModel("Account_admin", accountAdminSchema, connDb)          
          let userDoc = await User.findById(id)
          accountId = JSON.parse(JSON.stringify(userDoc.accountId))      
          
          /** Alert by sockets */
          io.to(accountId).to(req.params[0]).emit("alert_snackbar", {
            variant: 'info',
            text: 'Uploading file...',          
          });
            
          const parser = new DatauriParser();
          let newAccountDoc
          let accountData

          for (let file of files) {
            /** Upload file to cloud */
            fieldname = file.fieldname
            const datauri = parser.format(file.mimetype, file.buffer);
            let res_cloud = await uploadImage(datauri.content, { public_id: `${accountId}-${file.fieldname}`})
            
            if ( !res_cloud ) {
              throw("Upload file fail")
            }
            let img = { 
              [file.fieldname] : {
                public_id: res_cloud.public_id,
                secure_url: res_cloud.secure_url
              }
            }

            /** Database process */            
            sessionMongo = await connDb.startSession();    
            sessionMongo.startTransaction();

            if ( req.params[0] && superAdmin ) {
              newAccountDoc = await findByIdAndUpdateMongoose(Account, req.params[0], img, sessionMongo)
              let emailAccount = await User.findOne({ accountId: req.params[0] }, 'email');
              accountData = { 
                ...newAccountDoc._doc,
                email: emailAccount.email
              }    
            }          
            else {
              newAccountDoc = await findByIdAndUpdateMongoose(Account, userDoc.accountId, img, sessionMongo)
              accountData = { 
                ...newAccountDoc._doc,
                email: userDoc.email
              }    
            }
            assert.ok( newAccountDoc );
            
            await sessionMongo.commitTransaction();
            sessionMongo.endSession();
          }

          /** Update Front data and alert by sockets  */
          await sendDataSocket(io, 'Admin', 'admins', accountData)
          if ( req.params[0] && superAdmin ) {
            io.to(req.params[0]).emit("data_incoming", accountData);
          }          
          else {
            io.to(accountId).emit("data_incoming", accountData);
          }

          /** Alert data upload success by sockets  */
          io.to(accountId).to(req.params[0]).emit("alert_snackbar", {
            variant: 'success',
            text: 'Data Upload',          
          });
          return res.status(201).json(accountData) 
        }         
        catch (error) {
          console.log(error)
          if (typeof sessionMongo !== "undefined") {
            await sessionMongo.abortTransaction();
          }
          /** Alert by sockets */
          io.to(accountId).emit("alert_snackbar", {
            variant: 'error',
            text: 'Error',          
          });
          if ( req.params[0] && superAdmin ) {
            io.to(accountId).emit("fail_upload", 'admins', req.params[0], fieldname);  
          }
          else {
            io.to(accountId).emit("fail_upload", 'account', '', fieldname);
          }

          return res.status(500).json({ msg: error.message });
        }
        finally {
          if (typeof sessionMongo !== "undefined") {  
            await sessionMongo.endSession();
          }
          /** Alert by sockets */
          io.to(accountId).emit("alert_backdrop", false);
        
          // Close the connection to the MongoDB cluster
          //await closeConnectionMongoose(connDb)
        }
      case "DELETE":
        try {
          /** Connect to the database */          
          connDb = await getConnection(dbName)
          let User = getModel("Admin", userAdminSchema, connDb)
          let Account = getModel("Account_admin", accountAdminSchema, connDb)          
          let userDoc = await User.findById(id)
          accountId = JSON.parse(JSON.stringify(userDoc.accountId))      
          
          /** Alert by sockets */
          io.to(accountId).to(req.params[0]).emit("alert_snackbar", {
            variant: 'info',
            text: 'Changing...',          
          });

          const nameProperty = Object.keys(body)[0]
          let newAccountDoc
          let accountData

          let img = JSON.parse(JSON.stringify(body))
          img[nameProperty].public_id = ""
          img[nameProperty].secure_url = ""

          /** Check super admin */ 
          const { superAdmin } = await getUserPermissions(id)

          /** Database process */          
          sessionMongo = await connDb.startSession();    
          sessionMongo.startTransaction();

          if ( req.params[0] && superAdmin ) {
            newAccountDoc = await findByIdAndUpdateMongoose(Account, req.params[0], img, sessionMongo)
            let emailAccount = await User.findOne({ accountId: req.params[0] }, 'email');
            accountData = { 
              ...newAccountDoc._doc,
              email: emailAccount.email
            }    
          }          
          else {
            newAccountDoc = await findByIdAndUpdateMongoose(Account, userDoc.accountId, img, sessionMongo)
            accountData = { 
              ...newAccountDoc._doc,
              email: userDoc.email
            }    
          }
          assert.ok( newAccountDoc );
          
          await sessionMongo.commitTransaction();
          sessionMongo.endSession();
          sessionMongo = undefined

          /** Update Front data and alert by sockets  */
          await sendDataSocket(io, 'Admin', 'admins', accountData)
          if ( req.params[0] && superAdmin ) {
            io.to(req.params[0]).emit("data_incoming", accountData);
          }          
          else {
            io.to(accountId).emit("data_incoming", accountData);
          }

          /** Remove file form cloud */
          let res_cloud = await deleteImage(body[nameProperty].public_id)
          
          if ( !res_cloud ) {
            throw("Delete file fail")
          }
          /** Alert data upload success by sockets  */
          io.to(accountId).to(req.params[0]).emit("alert_snackbar", {
            variant: 'success',
            text: 'Success',          
          });
          return res.status(201).json(accountData) 
        }         
        catch (error) {
          console.log(error)
          if (typeof sessionMongo !== "undefined") {
            await sessionMongo.abortTransaction();
          }
          /** Alert by sockets */
          io.to(accountId).emit("alert_snackbar", {
            variant: 'error',
            text: 'Error',          
          });

          return res.status(500).json({ msg: error.message });
        }
        finally {
          if (typeof sessionMongo !== "undefined") {  
            await sessionMongo?.endSession();
          }
          /** Alert by sockets */
          io.to(accountId).emit("alert_backdrop", false);
        
          // Close the connection to the MongoDB cluster
          //await closeConnectionMongoose(connDb)
        }
        default:
          return res.status(401).json({ msg: "This method is not supported" });
    }
  });

  return router
}

module.exports = wrapper;

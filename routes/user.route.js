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
const { userSchema } = require("../models/User");
const { accountSchema } = require("../models/Account");
const { parentSchema } = require("../models/Parent");

/** Utils */
const assert = require("assert")
const multer  = require('multer')
const DatauriParser = require('datauri/parser');
const { uploadImage, deleteImage } = require('../lib/cloudinary');

const storage = multer.memoryStorage()
const upload = multer({ storage: storage })

const dbName = process.env.DATABASE_NAME

// Create wrapper function that will adjust router based on provided configuration
var wrapper = function (io) {
  router.all('/:id/account', async (req, res, next) => {
    const {
      method,
      params: { id },
      body,
    } = req;
    let connDb
    let accountId

    switch (method) {
      case "GET":
        return res.status(201).json({success:'success'})
      case "PUT":
        try {
          /** Connect to the database */          
          connDb = await getConnection(dbName)
          let User = getModel("User", userSchema, connDb)
          let Account = getModel("Account", accountSchema, connDb)          
          let userDoc = await User.findById(id).populate("accountId")
          accountId = JSON.parse(JSON.stringify(userDoc.accountId._id))
  
          /** Alert by sockets */
          io.to(accountId).emit("alert_snackbar", {
            variant: 'info',
            text: 'Processing',          
          });
          
          /** Database process */
          sessionMongo = await connDb.startSession();    
          sessionMongo.startTransaction();

          let newAccountDoc = await findByIdAndUpdateMongoose(Account, userDoc.accountId, body, sessionMongo)
          assert.ok( newAccountDoc );
          let accountData = { 
            ...newAccountDoc._doc,
            email: userDoc.email
          }    
          
          await sessionMongo.commitTransaction();
          sessionMongo.endSession();

          /** Update Front data and alert by sockets  */
          if ( userDoc.accountId?.category  != newAccountDoc?.category ) {
            io.to(userDoc.accountId?.category).emit("delete_data_list", 'users', accountId);
          }
          io.to(accountId).emit("data_incoming", accountData);
          io.to(newAccountDoc?.category).emit("data_list_incoming", 'users', accountData, ()=>{});

          io.to(accountId).emit("alert_snackbar", {
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
      default:
        return res.status(401).json({ msg: "This method is not supported" });
    }
  });
  
  router.all('/:id/files', upload.any(), async (req, res, next) => {
    const {
      method,
      params: { id },
      body,
      files,
    } = req;    
    let connDb
    let sessionMongo
    let session
    let accountId

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
          let User = getModel("User", userSchema, connDb)
          let Account = getModel("Account", accountSchema, connDb)          
          let userDoc = await User.findById(id)
          accountId = JSON.parse(JSON.stringify(userDoc.accountId))      

          /** Alert by sockets */
          io.to(accountId).emit("alert_snackbar", {
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
            
            newAccountDoc = await findByIdAndUpdateMongoose(Account, userDoc.accountId, img, sessionMongo)
            assert.ok( newAccountDoc );
            accountData = { 
              ...img,
              email: userDoc.email,
              _id: accountId
            }
  
            await sessionMongo.commitTransaction();
            sessionMongo.endSession();
          }          
          /** Update Front data and alert by sockets  */
          io.to(accountId).emit("data_incoming", accountData);
          io.to(newAccountDoc?.category).emit("data_list_incoming", 'users', accountData, ()=>{});

          /** Alert data upload success by sockets  */
          io.to(accountId).emit("alert_snackbar", {
            variant: 'success',
            text: 'Data Upload',          
          });
          return res.status(201).json(newAccountDoc) 
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
          io.to(accountId).emit("fail_upload", fieldname);

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
          let User = getModel("User", userSchema, connDb)
          let Account = getModel("Account", accountSchema, connDb)          
          let userDoc = await User.findById(id)
          accountId = JSON.parse(JSON.stringify(userDoc.accountId))
          
          /** Alert by sockets */
          io.to(accountId).emit("alert_snackbar", {
            variant: 'info',
            text: 'Changing...',          
          });

          const nameProperty = Object.keys(body)[0]

          let img = JSON.parse(JSON.stringify(body))
          img[nameProperty].public_id = ""
          img[nameProperty].secure_url = ""

          /** Database process */          
          sessionMongo = await connDb.startSession();    
          sessionMongo.startTransaction();
          
          let newAccountDoc = await findByIdAndUpdateMongoose(Account, userDoc.accountId, img, sessionMongo)
          assert.ok( newAccountDoc );
        
          await sessionMongo.commitTransaction();
          sessionMongo.endSession();
          sessionMongo = undefined

          /** Update Front data and alert by sockets  */
          let accountData = { 
            ...img,
            email: userDoc.email,
            _id: accountId
          }    

          io.to(accountId).emit("data_incoming", accountData);
          io.to(newAccountDoc?.category).emit("data_list_incoming", 'users', accountData, ()=>{});

          /** Remove file form cloud */
          let res_cloud = await deleteImage(body[nameProperty].public_id)
          
          if ( !res_cloud ) {
            throw("Delete file fail")
          }
          /** Alert data upload success by sockets  */
          io.to(accountId).emit("alert_snackbar", {
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
            await sessionMongo.endSession();
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

  router.all('/:id/account/parents', async (req, res, next) => {
    const {
      method,
      params: { id },
      query: { desactiveAfter }, 
      body,
    } = req;
    let connDb
    let accountId

    switch (method) {
      case "GET":
        return res.status(201).json({success:'success'})
      case "PUT":
        try {
          /** Connect to the database */          
          connDb = await getConnection(dbName)
          let User = getModel("User", userSchema, connDb)
          let Account = getModel("Account", accountSchema, connDb)   
          let Parent = getModel("Parent", parentSchema, connDb)                 
          let userDoc = await User.findById(id).populate("accountId")
          accountId = JSON.parse(JSON.stringify(userDoc.accountId._id))

          /** Alert by sockets */
          io.to(accountId).emit("alert_snackbar", {
            variant: 'info',
            text: 'Processing',          
          });

          /** Database process */
          sessionMongo = await connDb.startSession();    
          sessionMongo.startTransaction();
          //newAccountDoc = await Parent.create([...list], {session: sessionMongo})

          let newAccountDoc = []
          let parentAccount
          const parentsList = Object.values(body).filter((item)=> item.active)
          if ( parentsList.length > 2 ) {
            throw("Only two records are allowed")
          }

          for (let obj of parentsList) {
            if ( desactiveAfter ) {
              obj.active = false
            }
            if ( userDoc.accountId?.parentsId.includes(obj._id) ) {
              parentAccount = await findByIdAndUpdateMongoose(Parent, obj._id, obj, sessionMongo)
            }
            else {
              parentAccount = await createDocumentMongoose(Parent, obj, sessionMongo)
              assert.ok( parentAccount );
              let accountUpdate = await Account.updateOne(
                { _id: userDoc.accountId }, 
                { $push: { parentsId: parentAccount._id } },
                { session: sessionMongo }
              );
              assert.ok( accountUpdate );
            }
            newAccountDoc.push(parentAccount)       
          }

          let accountData = {
            parentsId: newAccountDoc,
            _id: accountId
          }    
          
          await sessionMongo.commitTransaction();
          sessionMongo.endSession();

          /** Update Front data and alert by sockets  */
          io.to(accountId).emit("data_incoming", accountData);
          io.to(userDoc?.accountId?.category).emit("data_list_incoming", 'users', accountData, ()=>{});

          io.to(accountId).emit("alert_snackbar", {
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
        default:
          return res.status(401).json({ msg: "This method is not supported" });
    }
  });
  
  return router
}

module.exports = wrapper;
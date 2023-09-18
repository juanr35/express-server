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
const { userSchema } = require("../models/User");
const { accountSchema } = require("../models/Account");
const { parentSchema } = require("../models/Parent");
const { medicalHistorySchema } = require("../models/HistoriaClinica");

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
  router.all('/:idAdmin/user/:idUser', async (req, res, next) => {
    const {
      method,
      params: { idAdmin, idUser },
      query: { socketId }, 
      body,
    } = req;
    let connDb
    let sessionMongo
    let accountAdminId

    /** Check write permissions  */
    const { superAdmin, permissions } = await getUserPermissions(idAdmin)
    
    switch (method) {
      case "GET":
        return res.status(201).json({success:'success'})
      case "PUT":
        try {
          /** Connect to the database */          
          connDb = await getConnection(dbName)
          /** Account Admin */
          let Admin = getModel("Admin", userAdminSchema, connDb)
          let AccountAdmin = getModel("Account_admin", accountAdminSchema, connDb)
          let adminDoc = await Admin.findById(idAdmin)
          accountAdminId = JSON.parse(JSON.stringify(adminDoc.accountId))
          /**Account User */
          let User = getModel("User", userSchema, connDb)
          let AccountUser = getModel("Account", accountSchema, connDb)                    
          let userDoc = await User.findOne({ accountId: idUser }).populate("accountId")

          /** Alert by sockets */
          io.to(idUser).to(accountAdminId).emit("alert_snackbar", {
            variant: 'info',
            text: 'Processing',          
          });
          
          if ( !permissions.write.includes(userDoc?.accountId.category) ) {
            io.to(accountAdminId).emit("alert_snackbar", {
              variant: 'error',
              text: 'Permission denied',          
            });

            return res.status(401).json({ msg: "Permission denied" });
          }

          /** Database process */
          sessionMongo = await connDb.startSession();    
          sessionMongo.startTransaction();

          let newAccountDoc = await findByIdAndUpdateMongoose(AccountUser, idUser, body, sessionMongo)
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
          await sendDataSocket(io, newAccountDoc.category, 'users', accountData)
          io.to(idUser).emit("data_incoming", accountData);
          io.to(idUser).to(accountAdminId).emit("alert_snackbar", {
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
          io.to(idUser).to(accountAdminId).emit("alert_snackbar", {
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
          io.to(idUser).to(accountAdminId).emit("alert_backdrop", false);
        
          // Close the connection to the MongoDB cluster
          //await closeConnectionMongoose(connDb)
        }
      case "DELETE":
        try {
          /** Connect to the database */          
          if ( !idUser || !superAdmin ) {
            return res.status(401).json({ msg: "Permission denied" });
          }

          /** Get super admin account */
          connDb = await getConnection(dbName)
          let Admin = getModel("Admin", userAdminSchema, connDb)
          let AccountAdmin = getModel("Account_admin", accountAdminSchema, connDb)
          let adminDoc = await Admin.findById(idAdmin)
          accountAdminId = JSON.parse(JSON.stringify(adminDoc.accountId))
          /**Account User */
          let User = getModel("User", userSchema, connDb)
          let AccountUser = getModel("Account", accountSchema, connDb)                    
          let userDoc = await User.findOne({ accountId: idUser }).populate("accountId")

          /** Alert by sockets */
          io.to(accountAdminId).emit("alert_snackbar", {
            variant: 'warning',
            text: 'Deleting...',          
          });
          
          /** Database process */          
          sessionMongo = await connDb.startSession();    
          sessionMongo.startTransaction();
                    
          let deleteAccount = await AccountUser.deleteOne(userDoc.accountId);
          assert.ok( deleteAccount );
          
          await sessionMongo.commitTransaction();
          sessionMongo.endSession();
          console.log(`The account with _id: ${idUser} and refers has been deleted`)

          /** Remove file form cloud */
          let res_cloud = true

          new Array('image_1', 'image_2', 'image_3').forEach( async (option) => {
            if ( userDoc.accountId && userDoc.accountId[option]?.public_id ) {
              res_cloud = await deleteImage( userDoc.accountId[option].public_id )
  
              if ( !res_cloud ) {
                throw("Delete file fail")
              }
            }
          })          
          
          /** Update Front data and alert by sockets  */
          io.to(userDoc.accountId?.category).emit("delete_data_list", 'users', idUser);
          io.to(idUser).emit("account_deleted");

          io.to(accountAdminId).emit("alert_snackbar", {
            variant: 'warning',
            text: 'Account deleted',          
          });

          return res.status(201).json(deleteAccount) 
        }         
        catch (error) {
          console.log(error)
          if (typeof sessionMongo !== "undefined") {
            await sessionMongo.abortTransaction();
          }
          /** Alert by sockets */
          io.to(accountAdminId).emit("alert_snackbar", {
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
          io.to(accountAdminId).emit("alert_backdrop", false);
        
          // Close the connection to the MongoDB cluster
          //await closeConnectionMongoose(connDb)
        }
  
        default:
          return res.status(401).json({ msg: "This method is not supported" });
    }
  });

  router.all('/:idAdmin/user/parents/:idUser', async (req, res, next) => {
    const {
      method,
      params: { idAdmin, idUser },
      query: { socketId, desactiveAfter }, 
      body,
    } = req;
    let connDb
    let sessionMongo
    let accountAdminId

    /** Check write permissions  */
    const { superAdmin, permissions } = await getUserPermissions(idAdmin)

    switch (method) {
      case "GET":
        return res.status(201).json({success:'success'})
      case "PUT":
        try {
          /** Connect to the database */          
          connDb = await getConnection(dbName)
          /** Account Admin */
          let Admin = getModel("Admin", userAdminSchema, connDb)
          let AccountAdmin = getModel("Account_admin", accountAdminSchema, connDb)
          let Parent = getModel("Parent", parentSchema, connDb)                 
          let adminDoc = await Admin.findById(idAdmin)
          accountAdminId = JSON.parse(JSON.stringify(adminDoc.accountId))
          /**Account User */
          let User = getModel("User", userSchema, connDb)
          let AccountUser = getModel("Account", accountSchema, connDb)                    
          let userDoc = await User.findOne({ accountId: idUser }).populate("accountId")

          /** Alert by sockets */
          io.to(idUser).to(accountAdminId).emit("alert_snackbar", {
            variant: 'info',
            text: 'Processing',          
          });
          
          if ( !permissions.write.includes(userDoc?.accountId.category) ) {
            io.to(accountAdminId).emit("alert_snackbar", {
              variant: 'error',
              text: 'Permission denied',          
            });

            return res.status(401).json({ msg: "Permission denied" });
          }

          /** Database process */
          sessionMongo = await connDb.startSession();    
          sessionMongo.startTransaction();


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
              let accountUpdate = await AccountUser.updateOne(
                { _id: idUser }, 
                { $push: { parentsId: parentAccount._id } },
                { session: sessionMongo }
              );
              assert.ok( accountUpdate );
            }
            newAccountDoc.push(parentAccount)       
          }

          let accountData = {
            parentsId: newAccountDoc,
            _id: idUser
          }    
          await sessionMongo.commitTransaction();
          sessionMongo.endSession();

          /** Update Front data and alert by sockets  */
          await sendDataSocket(io, userDoc.accountId.category, 'users', accountData)
          io.to(idUser).emit("data_incoming", accountData);
          io.to(idUser).to(accountAdminId).emit("alert_snackbar", {
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
          io.to(idUser).to(accountAdminId).emit("alert_snackbar", {
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
          io.to(idUser).to(accountAdminId).emit("alert_backdrop", false);
        
          // Close the connection to the MongoDB cluster
          //await closeConnectionMongoose(connDb)
        }
        default:
          return res.status(401).json({ msg: "This method is not supported" });
    }
  });

  router.all('/:idAdmin/user/medical/:idUser', async (req, res, next) => {
    const {
      method,
      params: { idAdmin, idUser },
      query: { socketId, desactiveAfter }, 
      body,
    } = req;
    let connDb
    let sessionMongo
    let accountAdminId

    /** Check write permissions  */
    const { superAdmin, permissions } = await getUserPermissions(idAdmin)

    switch (method) {
      case "GET":
        return res.status(201).json({success:'success'})
      case "PUT":
        try {
          /** Connect to the database */          
          connDb = await getConnection(dbName)
          /** Account Admin */
          let Admin = getModel("Admin", userAdminSchema, connDb)
          let AccountAdmin = getModel("Account_admin", accountAdminSchema, connDb)
          let MedicalHistory = getModel("MedicalHistory", medicalHistorySchema, connDb)                 
          let adminDoc = await Admin.findById(idAdmin)
          accountAdminId = JSON.parse(JSON.stringify(adminDoc.accountId))
          /**Account User */
          let User = getModel("User", userSchema, connDb)
          let AccountUser = getModel("Account", accountSchema, connDb)                    
          let userDoc = await User.findOne({ accountId: idUser }).populate("accountId")

          /** Alert by sockets */
          io.to(idUser).to(accountAdminId).emit("alert_snackbar", {
            variant: 'info',
            text: 'Processing',          
          });
          
          if ( !permissions.write.includes(userDoc?.accountId.category) ) {
            io.to(accountAdminId).emit("alert_snackbar", {
              variant: 'error',
              text: 'Permission denied',          
            });

            return res.status(401).json({ msg: "Permission denied" });
          }

          /** Database process */
          sessionMongo = await connDb.startSession();    
          sessionMongo.startTransaction();

          let newAccountDoc 
          let historyAccount
          if ( userDoc.accountId?.medicalHistoryId == body._id ) {
            historyAccount = await findByIdAndUpdateMongoose(MedicalHistory, body._id, body, sessionMongo)
          }
          else {
            historyAccount = await createDocumentMongoose(MedicalHistory, body, sessionMongo)
            assert.ok( historyAccount );
            let accountUpdate = await AccountUser.updateOne(
              { _id: idUser }, 
              { medicalHistoryId: historyAccount._id },
              { session: sessionMongo }
            );
            assert.ok( accountUpdate );
          }  

          let accountData = {
            medicalHistoryId: historyAccount,
            _id: idUser
          }    
          await sessionMongo.commitTransaction();
          sessionMongo.endSession();

          /** Update Front data and alert by sockets  */
          await sendDataSocket(io, userDoc.accountId.category, 'users', accountData)
          io.to(idUser).emit("data_incoming", accountData);
          io.to(idUser).to(accountAdminId).emit("alert_snackbar", {
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
          io.to(idUser).to(accountAdminId).emit("alert_snackbar", {
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
          io.to(idUser).to(accountAdminId).emit("alert_backdrop", false);
        
          // Close the connection to the MongoDB cluster
          //await closeConnectionMongoose(connDb)
        }
        default:
          return res.status(401).json({ msg: "This method is not supported" });
    }
  });

  router.all('/:idAdmin/user/files/:idUser', upload.any(), async (req, res, next) => {
    const {
      method,
      params: { idAdmin, idUser },
      query: { socketId }, 
      body,
      files,
    } = req;
    let connDb
    let sessionMongo
    let accountAdminId
    
    /** Check write permissions  */
    const { superAdmin, permissions } = await getUserPermissions(idAdmin)
    
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
          /** Account Admin */
          let Admin = getModel("Admin", userAdminSchema, connDb)
          let AccountAdmin = getModel("Account_admin", accountAdminSchema, connDb)
          let adminDoc = await Admin.findById(idAdmin)
          accountAdminId = JSON.parse(JSON.stringify(adminDoc.accountId))
          /**Account User */
          let User = getModel("User", userSchema, connDb)
          let AccountUser = getModel("Account", accountSchema, connDb)                    
          let userDoc = await User.findOne({ accountId: idUser }).populate("accountId")

          /** Alert by sockets */
          io.to(idUser).to(accountAdminId).emit("alert_snackbar", {
            variant: 'info',
            text: 'Uploading file...',          
          });
            
          if ( !permissions.write.includes(userDoc?.accountId.category) ) {
            io.to(accountAdminId).emit("alert_snackbar", {
              variant: 'error',
              text: 'Permission denied',          
            });

            return res.status(401).json({ msg: "Permission denied" });
          }

          const parser = new DatauriParser();
          let newAccountDoc
          let accountData

          for (let file of files) {
            /** Upload file to cloud */
            fieldname = file.fieldname
            const datauri = parser.format(file.mimetype, file.buffer);
            let res_cloud = await uploadImage(datauri.content, { public_id: `${idUser}-${file.fieldname}`})
            
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
            
            newAccountDoc = await findByIdAndUpdateMongoose(AccountUser, idUser, img, sessionMongo)
            assert.ok( newAccountDoc );
            accountData = { 
              ...newAccountDoc._doc,
              email: userDoc.email
            }    
              
            await sessionMongo.commitTransaction();
            sessionMongo.endSession();
          }          
          /** Update Front data and alert by sockets  */
          await sendDataSocket(io, newAccountDoc.category, 'users', accountData)
          io.to(idUser).emit("data_incoming", accountData);
        
          /** Alert data upload success by sockets  */
          io.to(idUser).to(accountAdminId).emit("alert_snackbar", {
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
          io.to(idUser).to(accountAdminId).emit("alert_snackbar", {
            variant: 'error',
            text: 'Error',          
          });
          io.to(accountAdminId).emit("fail_upload", 'users', idUser, fieldname);
          io.to(idUser).emit("fail_upload", fieldname);

          return res.status(500).json({ msg: error.message });
        }
        finally {
          if (typeof sessionMongo !== "undefined") {  
            await sessionMongo.endSession();
          }
          /** Alert by sockets */
          io.to(accountAdminId).emit("alert_backdrop", false);
        
          // Close the connection to the MongoDB cluster
          //await closeConnectionMongoose(connDb)
        }
      case "DELETE":
        try {
          /** Connect to the database */          
          connDb = await getConnection(dbName)
          /** Account Admin */
          let Admin = getModel("Admin", userAdminSchema, connDb)
          let AccountAdmin = getModel("Account_admin", accountAdminSchema, connDb)
          let adminDoc = await Admin.findById(idAdmin)
          accountAdminId = JSON.parse(JSON.stringify(adminDoc.accountId))
          /**Account User */
          let User = getModel("User", userSchema, connDb)
          let AccountUser = getModel("Account", accountSchema, connDb)                    
          let userDoc = await User.findOne({ accountId: idUser }).populate("accountId")

          /** Alert by sockets */
          io.to(idUser).to(accountAdminId).emit("alert_snackbar", {
            variant: 'info',
            text: 'Changing...',          
          });
            
          if ( !permissions.write.includes(userDoc.accountId.category) ) {
            io.to(accountAdminId).emit("alert_snackbar", {
              variant: 'error',
              text: 'Permission denied',          
            });

            return res.status(401).json({ msg: "Permission denied" });
          }

          const nameProperty = Object.keys(body)[0]

          let img = JSON.parse(JSON.stringify(body))
          img[nameProperty].public_id = ""
          img[nameProperty].secure_url = ""

          /** Database process */            
          sessionMongo = await connDb.startSession();    
          sessionMongo.startTransaction();
            
          let newAccountDoc = await findByIdAndUpdateMongoose(AccountUser, idUser, img, sessionMongo)
          assert.ok( newAccountDoc );
          let accountData = { 
            ...newAccountDoc._doc,
            email: userDoc.email
          }    
  
          await sessionMongo.commitTransaction();
          sessionMongo.endSession();
          sessionMongo = undefined
          
          /** Update Front data and alert by sockets  */
          await sendDataSocket(io, newAccountDoc.category, 'users', accountData)
          io.to(idUser).emit("data_incoming", accountData);
        
          /** Remove file form cloud */
          let res_cloud = await deleteImage(body[nameProperty].public_id)

          if ( !res_cloud ) {
            throw("Delete file fail")
          }
          
          /** Alert data upload success by sockets  */
          io.to(idUser).to(accountAdminId).emit("alert_snackbar", {
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
          io.to(idUser).to(accountAdminId).emit("alert_snackbar", {
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
          io.to(accountAdminId).emit("alert_backdrop", false);
        
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

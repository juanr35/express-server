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
  router.all('/:id/get-users', async (req, res, next) => {
    const {
      method,
      params: { id },
      query: { socketId,  }, 
      body,
    } = req;
    let connDb
    let sessionMongo

    switch (method) {
      case "GET":
        connDb = await getConnection(process.env.DATABASE_NAME)  
        
        let User = getModel("User", userAdminSchema, connDb)
        let Account = getModel("Account", accountSchema, connDb)   
        
        const { superAdmin, permissions } = await getUserPermissions(id)
        //const cursor = await Account.find().cursor()
        const cursor = await Account.find({ category: { $in: permissions?.read }}).cursor()
        
        let count = 0
        //io.to(id).emit("data_list_incoming", cursor.next());
        
        try {                  
          for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
            let userDoc = await User.findOne({ accountId: doc._id }, 'email');
            let data = { 
              ...doc._doc,
              email: userDoc.email
            }
            await sendDataSocket(io, socketId, 'users', data)
            count = count + 1
            console.log(count)
          }
        } 
        catch (error) {
          console.log(error)
          return res.status(500).json({ msg: 'could not load all the data' });  
        }
        return res.status(201).json({success:'success'})

        default:
          return res.status(401).json({ msg: "This method is not supported" });
    }
  });

  router.all('/:id/get-admins', async (req, res, next) => {
    const {
      method,
      params: { id },
      query: { socketId,  }, 
      body,
    } = req;
    let connDb
    let sessionMongo

    switch (method) {
      case "GET":
        connDb = await getConnection(process.env.DATABASE_NAME)  
        
        let User = getModel("Admin", userAdminSchema, connDb)
        let Account = getModel("Account_admin", accountAdminSchema, connDb)   
        
        const { superAdmin, permissions } = await getUserPermissions(id)

        if ( !superAdmin ) {
          return res.status(401).json({ msg: "This method is not supported" });
        }
        const cursor = await Account.find({ superAdmin: false }).cursor()
        
        let count = 0
        //io.to(id).emit("data_list_incoming", cursor.next());
        
        try {                  
          for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
            let userDoc = await User.findOne({ accountId: doc._id }, 'email');
            let data = { 
              ...doc._doc,
              email: userDoc.email
            }
            await sendDataSocket(io, socketId, 'admins', data)
            count = count + 1
            console.log(count)
          }
        } 
        catch (error) {
          console.log(error)
          return res.status(500).json({ msg: 'could not load all the data' });  
        }
        return res.status(201).json({success:'success'})

        default:
          return res.status(401).json({ msg: "This method is not supported" });
    }
  });

  /** Hay que reconsiderar la implementacion del parametro final de la ruta */
  //router.all('/:id/account/:idAccount', async (req, res, next) => {
  router.all('/:id/account/?*', async (req, res, next) => {
    const {
      method,
      body,
      params: { id },
      /** Params for show different alert for permissions change */
      query : { onlyPermission, option, category }
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
        try {
          /** Connect to the database */          
          connDb = await getConnection(dbName)
          let User = getModel("Admin", userAdminSchema, connDb)
          let Account = getModel("Account_admin", accountAdminSchema, connDb)
          let userDoc = await User.findById(id)
          accountId = JSON.parse(JSON.stringify(userDoc.accountId))

          /** Alert by sockets */
          !onlyPermission && io.to(accountId).to(req.params[0]).emit("alert_snackbar", {
            variant: 'info',
            text: 'Processing',          
          });
          
          /** Database process */          
          sessionMongo = await connDb.startSession();    
          sessionMongo.startTransaction();
          
          let newAccountDoc
          let accountData
          if ( req.params[0] && superAdmin ) {
            newAccountDoc = await findByIdAndUpdateMongoose(Account, req.params[0], body, sessionMongo)
            let emailAccount = await User.findOne({ accountId: req.params[0] }, 'email');
            accountData = { 
              ...newAccountDoc._doc,
              email: emailAccount.email
            }  
          }          
          else {
            /** Only super admin can modify permissions */
            delete body.permissions
            newAccountDoc = await findByIdAndUpdateMongoose(Account, userDoc.accountId, body, sessionMongo)
            accountData = { 
              ...newAccountDoc._doc,
              email: userDoc.email
            }  
          }
          assert.ok( newAccountDoc );
          
          await sessionMongo.commitTransaction();
          sessionMongo.endSession();

          /** Update Front data and alert by sockets  */
          await sendDataSocket(io, 'Admin', 'admins', accountData)
          if ( req.params[0] && superAdmin ) {
            io.to(req.params[0]).emit("data_incoming", accountData);
          }          
          else {
            io.to(accountId).emit("data_incoming", accountData);
          }
          io.to(accountId).to(req.params[0]).emit("alert_snackbar", {
            variant: 'success',
            text: onlyPermission ? 
              `category ${category.toLowerCase()} ${option} permission modified` : 'Data Upload',          
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
      case "DELETE":
        try {
          /** Connect to the database */          
          if ( !req.params[0] || !superAdmin ) {
            return res.status(401).json({ msg: "Permission denied" });
          }

          /** Get super admin account */
          connDb = await getConnection(dbName)
          let User = getModel("Admin", userAdminSchema, connDb)
          let Account = getModel("Account_admin", accountAdminSchema, connDb)
          let userDoc = await User.findById(id)
          accountId = JSON.parse(JSON.stringify(userDoc.accountId))

          /** Get the other admin account */             
          let accountDoc = await Account.findOne({ _id: req.params[0] })
         
          /** Alert by sockets */
          io.to(accountId).emit("alert_snackbar", {
            variant: 'warning',
            text: 'Deleting...',          
          });
          
          /** Database process */          
          sessionMongo = await connDb.startSession();    
          sessionMongo.startTransaction();
                    
          let deleteAccount = await Account.deleteOne(accountDoc);
          assert.ok( deleteAccount );
          
          await sessionMongo.commitTransaction();
          sessionMongo.endSession();
          console.log(`The account with _id: ${req.params[0]} and refers has been deleted`)

          /** Remove file form cloud */
          let res_cloud = true

          new Array('image_1', 'image_2').forEach( async (option) => {
            if ( accountDoc && accountDoc[option]?.public_id ) {
              res_cloud = await deleteImage( accountDoc[option].public_id )
  
              if ( !res_cloud ) {
                throw("Delete file fail")
              }
            }
          })          
          
          /** Update Front data and alert by sockets  */
          io.to('Admin').emit("delete_data_list", 'admins', req.params[0]);
          io.to(req.params[0]).emit("account_deleted");

          io.to(accountId).emit("alert_snackbar", {
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

          new Array('image_1', 'image_2').forEach( async (option) => {
            if ( userDoc.accountId && userDoc.accountId[option]?.public_id ) {
              res_cloud = await deleteImage( accountDoc[option].public_id )
  
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

const randomstring = require("randomstring");

const createModel = (name, schema, connection) => {
  const model = connection.model(name, schema);
  return model;
}

const getModel = (name, schema, connection) => {
  let model;
  if (connection.modelNames().includes(name)) {
    model = connection.model(name);
  }
  else {
    model = createModel(name, schema, connection);
  }
  return model;
}

/**
* Create a new user
* @param {userSchema} Model
* @param {ClientSession} session The session for transaction
* @param {Object} credentials
*/
async function createUserCredentialMongoose(Model, obj, session = null) {
  const newUser = new Model()
  newUser.email = obj.email
  newUser.password = newUser.encryptPassword(obj.password)
  newUser.accountId = obj.accountId
  newUser.verifyId = obj.verifyId
  const result = await newUser.save({session})
  console.log(`New user created with the following id: ${result._id}`);
  return result
}

/**
* Verify email user
* @param {userSchema} Model
* @param {ClientSession} session The session for transaction
*/
async function createVerificationMongoose(Model, session = null) {
  const newVerify = new Model()
  const random = randomstring.generate(6);
  newVerify.hash = random
  const result = await newVerify.save({session})
  console.log(`Verification document created with the following id: ${result._id}`);
  return result
}

/**
* Create a new document
* @param {ModelMongoose} Model
* @param {ClientSession} session The session for transaction
* @param {Object} obj The new document to be added
*/
async function createDocumentMongoose(Model, obj, session = null){
  const newDoc = new Model(obj)
  const result = await newDoc.save({session})
  console.log(`New listing created in ${Model.modelName} model with the following id: ${result._id}`);
  return result
}

/**
* Print a document with the given email
* Note: If more than one listing has the same name, only the first listing the database finds will be printed.
* @param {ModelMongoose} Model A MongoClient that is connected to a cluster with the sample_airbnb database
* @param {String} target The email
*/
async function findOneByEmailMongoose(Model, target) {
  const result = await Model.findOne({email: target})

  if (result) {
      console.log(`Found a listing in the collection with the email: '${target}' with model ${Model.modelName}`);
      return result
  } else {
      console.log(`No listings found with the email '${target}' - mongoose`);
      return null
  }
}

/**
* Print a document with the given id
* @param {ModelMongoose} Model A MongoClient that is connected to a cluster with the sample_airbnb database
* @param {String} target The id
*/
async function findByIdMongoose(Model, id) {
  const result = await Model.findById(id)

  if (result) {
      console.log(`Found a listing in the collection with the id: '${id}' with model ${Model.modelName}`);
      return result
  } else {
      console.log(`No listings found with the id '${id}'`);
      return null
  }
}

/**
* Search and update a document with the given id
* @param {ModelMongoose} Model A MongoClient that is connected to a cluster with the sample_airbnb database
* @param {String} id The id of the document
* @param {Object} update The document to update
* @param {ClientSession} session The session for transaction
*/
async function findByIdAndUpdateMongoose(Model, id, update, session = null) {
  const options = {
    returnDocument: 'after',
    runValidators: true
  }
  const result = await Model.findByIdAndUpdate(id, update, options).session(session)

  if (result) {
      console.log(`Updated a listing with the id: '${id}' using the data '${JSON.stringify(update)}' with model ${Model.modelName}`);
      return result
  } else {
      console.log(`No listings updated with the id '${id}'`);
      return null
  }
}

/**
* Delete a document with the given id
* @param {ModelMongoose} Model A MongoClient that is connected to a cluster with the sample_airbnb database
* @param {String|Object} id The id of the document
* @param {ClientSession} session The session for transaction
*/
async function findByIdAndDeleteMongoose(Model, id, session = null) {
  const result = await Model.findByIdAndDelete(id).session(session)

  if (result) {
      console.log(`Deleted a listing with the id: '${JSON.stringify(id)}' with model ${Model.modelName}`);
      return result
  } else {
      console.log(`No found to delete listing with the id '${id}'`);
      return null
  }
}

module.exports = { 
  getModel,
  createUserCredentialMongoose,
  createVerificationMongoose,
  createDocumentMongoose,
  findOneByEmailMongoose,
  findByIdMongoose,
  findByIdAndUpdateMongoose,
  findByIdAndDeleteMongoose, 
}
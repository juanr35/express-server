const mongoose = require("mongoose");

const options = {
  // options
}
let conn
const createConn = async (uri, dbName = "") => {
  
  try {    
    let conn = await mongoose.createConnection(uri, options).asPromise();
    //await mongoose.connect(uri, options);
    //conn = mongoose.connection
    
    conn.on("connecting", () => {
      console.log(`Connecting to db ${dbName}... - mongoose`);
    });
    
    conn.on("connected", () => {
      console.log(`Connected to db: ${dbName} - mongoose`);
    });
    
    conn.on("disconnected", () => {
      console.log(`db: ${dbName} disconnected! - mongoose`);
    });
    
    conn.on("error", (err) => {
      console.error("Error: ", err.message);
    });

    /* 
    conn.on("error", () => {
      console.error("Connection error");
    });
    */
    
    return conn
  } 
  catch (error) {
    console.error("Error: ", error.message);
    throw "Connect Failed"    
  }
}

const getConnection = async (dbName) => {
  const uri = `${process.env.DATABASE_URI}/${dbName}?retryWrites=true&w=majority`

  let [ connection ] = mongoose.connections.filter(conn => conn.name === dbName);
  
  if (!connection) {
    connection = await createConn(uri, dbName);
  }

  //let connection = await createConn(uri, dbName);

  if (connection.readyState !== 1) {
    if (connection.readyState === 2) {
      await connection.$initialConnection
    }
    else {
      await connection.openUri(uri, options)
    }
  }
  return connection;
}

const closeConnectionMongoose = async (connection) => {

  if (typeof connection !== "undefined") {
    await connection.close();
  }
}

module.exports = { 
  getConnection, 
  closeConnectionMongoose 
}
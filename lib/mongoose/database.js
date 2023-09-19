const mongoose = require("mongoose")

const MONGODB_URI = `${process.env.DATABASE_URI}/${process.env.DATABASE_NAME}?retryWrites=true&w=majority`
opts = {}

console.log(`Try to connect to database uri: ${MONGODB_URI.slice(0, 25)}...`)

mongoose.connect(MONGODB_URI, { keepAlive: true, keepAliveInitialDelay: 300000 })
  .then((mongoose) => {
    console.log("database is connected")
    return mongoose
  })
  .catch((error) => {
    console.log(error)
  })

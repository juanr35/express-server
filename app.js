/** Server */
const express = require('express');
require('dotenv').config();
const app = express();
const http = require('http');
const server = http.createServer(app);
const createError = require('http-errors');

/** Sockets.IO */
const { Server } = require("socket.io");
const io = new Server(server, {
  cors: {
    //origin: "*", //allowing cors from anywhere
    origin: [process.env.USER_AUTH_DOMAIN, process.env.ADMIN_AUTH_DOMAIN],
    credentials: true,
  },
});

/** Utils */
const cors = require('cors');
const morgan = require('morgan');

/** Routes wrapper */
/** Validation */
const validateSessionRouter = require('./routes/api.validation')
/** Api user */
var wrapperRouter = require('./routes/user.route')
/** Api admin */
//var wrapperAdmin = require('./routes/admin.route')
var wrapperAdminAccount = require('./routes/admin.account.route')
var wrapperAdminFiles = require('./routes/admin.files.route')
var wrapperAdminUser = require('./routes/admin.accountuser.route')

/** Validation utils */
const { validateSessionSocket } = require('./lib/utils')
const { getUserPermissions } = require('./lib/utils')

// initializations 
require("./lib/mongoose/database")

var corsOptions = {
  //origin: "*", //allowing cors from anywhere
  origin: [process.env.USER_AUTH_DOMAIN, process.env.ADMIN_AUTH_DOMAIN],
  credentials: true,
  optionsSuccessStatus: 200, // For legacy browser support
}

app.use(express.urlencoded({ extended: false }));
app.use(morgan('dev'));
app.use(express.json());

app.get('/', (req, res) => {
  res.json({response: 'success'});
});

/** Api users */
app.use('/api-user', cors(corsOptions), validateSessionRouter, wrapperRouter(io));
/** Api admins */
app.use('/api-admin', cors(corsOptions), validateSessionRouter, wrapperAdminAccount(io));
app.use('/api-admin', cors(corsOptions), validateSessionRouter, wrapperAdminFiles(io));
app.use('/api-admin', cors(corsOptions), validateSessionRouter, wrapperAdminUser(io));

app.use((req, res, next) => {
  next(createError.NotFound());
});

app.use((err, req, res, next) => {
  res.status(err.status || 500);
  res.send({
    status: err.status || 500,
    message: err.message,
  });
});

io.use( async (socket, next) => {
  //const session = await validateSession(socket.request)
  const session = await validateSessionSocket({
    headers: {
      cookie: socket.handshake.query.cookies
  }})
  if (session && session?.user.accountId == socket.handshake.query.id) {
    const { superAdmin, permissions } = await getUserPermissions(session.user._id)
    socket.user = session.user;
    socket.superAdmin = superAdmin
    socket.permissions = permissions?.read
    next();
  } 
  else {
    console.log("unknown user")
    next(new Error("unknown user"));
  }
});

io.on('connection', (socket) => {
  console.log(`Connected user with _id: ${socket.handshake.query.id}`);
  socket.join(socket.handshake.query.id);
  if ( socket.permissions ) {
    socket.permissions.forEach( item => {
      socket.join(item)
    })
  }
  
  socket.onAny((event, ...args) => {
    console.log(event, args);
  });
  socket.on('disconnect', () => {
    console.log(`Disconnected user with _id: ${socket.handshake.query.id}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 @ http://localhost:${PORT}`));
const router = require('express').Router();
const axios = require('axios').default;

router.all('/:id/*', async (req, res, next) => {
  const {
    params: { id },
    headers,
  } = req;
  let session

  /** Check headers and cookies for authentication */
  if (!headers.cookie) {
    return res.status(400).json({ message: "Not authorized" });
  }

  try {
    const result = await axios({
      url: `${process.env.USER_AUTH_DOMAIN}/api/auth/session`,
      method: "get",
      headers: {
        'Cookie': headers.cookie
      }
    })
    session = result.data
  } 
  catch (error) {
    return res.status(400).json({ message: "Not authorized" });
  }

  if ( !session || !session?.user?.verified || session?.user?._id !== id ) {
    return res.status(401).json({ msg: "Invalid session" });
  }
  return next()
})

module.exports = router
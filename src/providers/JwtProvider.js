import JWT from 'jsonwebtoken'

const generateToken = (userInfo, secretSignature, tokenLife) => {
  try {
    return JWT.sign(userInfo, secretSignature, { expiresIn: tokenLife })
  } catch (error) {
    throw new Error(error)
  }
}

const verifyToken = (token, secretSignature) => {
  try {
    return JWT.verify(token, secretSignature)
  } catch (error) {
    throw new Error(error)
  }
}

export const JwtProvider = {
  generateToken,
  verifyToken
}
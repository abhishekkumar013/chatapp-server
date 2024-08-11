'use strict'
import { createCipheriv } from 'crypto'

const ErrorCode = {
  success: 0,
  appIDInvalid: 1,
  userIDInvalid: 3,
  secretInvalid: 5,
  effectiveTimeInSecondsInvalid: 6,
}

function RndNum(a, b) {
  return Math.ceil((a + (b - a)) * Math.random())
}

// Generate int32 random number
function makeNonce() {
  return RndNum(-2147483648, 2147483647)
}

function makeRandomIv() {
  const str = '0123456789abcdefghijklmnopqrstuvwxyz'
  const result = []
  for (let i = 0; i < 16; i++) {
    const r = Math.floor(Math.random() * str.length)
    result.push(str.charAt(r))
  }
  return result.join('')
}

// Encryption method, Only supports 16 24 32 bits
function getAlgorithm(keyBase64) {
  const key = Buffer.from(keyBase64)
  switch (key.length) {
    case 16:
      return 'aes-128-cbc'
    case 24:
      return 'aes-192-cbc'
    case 32:
      return 'aes-256-cbc'
    default:
      throw new Error('Invalid key length: ' + key.length)
  }
}

// AES encryption, using mode: CBC/PKCS5Padding
function aesEncrypt(plainText, key, iv) {
  const cipher = createCipheriv(getAlgorithm(key), key, iv)
  cipher.setAutoPadding(true)
  const encrypted = cipher.update(plainText)
  const final = cipher.final()
  const out = Buffer.concat([encrypted, final])
  return Uint8Array.from(out).buffer
}

function generateToken04(
  appId,
  userId,
  secret,
  effectiveTimeInSeconds,
  payload,
) {
  if (!appId || typeof appId !== 'number') {
    throw {
      errorCode: ErrorCode.appIDInvalid,
      errorMessage: 'appID invalid',
    }
  }
  if (!userId || typeof userId !== 'string') {
    throw {
      errorCode: ErrorCode.userIDInvalid,
      errorMessage: 'userId invalid',
    }
  }
  if (!secret || typeof secret !== 'string' || secret.length !== 32) {
    throw {
      errorCode: ErrorCode.secretInvalid,
      errorMessage: 'secret must be a 32 byte string',
    }
  }
  if (!effectiveTimeInSeconds || typeof effectiveTimeInSeconds !== 'number') {
    throw {
      errorCode: ErrorCode.effectiveTimeInSecondsInvalid,
      errorMessage: 'effectiveTimeInSeconds invalid',
    }
  }
  const createTime = Math.floor(new Date().getTime() / 1000)
  const tokenInfo = {
    app_id: appId,
    user_id: userId,
    nonce: makeNonce(),
    ctime: createTime,
    expire: createTime + effectiveTimeInSeconds,
    payload: payload || '',
  }
  // Convert token information into json
  const plainText = JSON.stringify(tokenInfo)
  console.log('plain text: ', plainText)
  // A randomly generated 16-byte string is used as an AES encryption vector, and it is placed in front of the ciphertext and encoded with Base64 to generate the final token
  const iv = makeRandomIv()
  console.log('iv', iv)
  // Encrypt
  const encryptBuf = aesEncrypt(plainText, secret, iv)
  // Token = binary splicing expiration time + Base64(iv length + iv + encrypted information length + encrypted information)
  const b1 = new Uint8Array(8)
  const b2 = new Uint8Array(2)
  const b3 = new Uint8Array(2)
  new DataView(b1.buffer).setBigInt64(0, BigInt(tokenInfo.expire), false)
  new DataView(b2.buffer).setUint16(0, iv.length, false)
  new DataView(b3.buffer).setUint16(0, encryptBuf.byteLength, false)
  const buf = Buffer.concat([
    Buffer.from(b1),
    Buffer.from(b2),
    Buffer.from(iv),
    Buffer.from(b3),
    Buffer.from(encryptBuf),
  ])
  const dv = new DataView(Uint8Array.from(buf).buffer)
  // Packed data
  // console.log('-----------------');
  // console.log('-------getBigInt64----------', dv.getBigInt64(0));
  // console.log('-----------------');
  // console.log('-------getUint16----------', dv.getUint16(8));
  // console.log('-----------------');
  return '04' + Buffer.from(dv.buffer).toString('base64')
}

export { generateToken04 }

import * as Client from '@web3-storage/w3up-client'

let clientPromise = null

async function getClient() {
  if (!clientPromise) {
    clientPromise = (async () => {
      console.log('Initializing w3up client...')
      const client = await Client.create()

      // One-time login per device (opens email auth)
      if (!client.currentSpace()) {
        console.log('Logging in to Web3.Storage...')
        await client.login(import.meta.env.VITE_WEB3_EMAIL)

        const spaces = await client.spaces()
        const space = spaces[0]
        await client.setCurrentSpace(space.did())
        console.log('Using space:', space.did())
      }

      return client
    })()
  }

  return clientPromise
}

export async function uploadToIPFS(blob) {
  try {
    const client = await getClient()

    console.log('Creating file from blob...')
    const file = new File([blob], 'encrypted-file')

    console.log('Uploading file to IPFS via Web3.Storage...')
    const cid = await client.uploadFile(file)

    console.log('Upload successful! CID:', cid.toString())
    return cid.toString()
  } catch (error) {
    console.error('Upload failed:', error)
    throw error
  }
}

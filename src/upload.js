import * as Client from '@web3-storage/w3up-client'

let clientPromise = null

async function getClient() {
  if (!clientPromise) {
    clientPromise = (async () => {
      const client = await Client.create()

      // One-time login per device (opens email auth)
      if (!client.currentSpace()) {
        await client.login(import.meta.env.VITE_WEB3_EMAIL)

        const spaces = await client.spaces()
        const space = spaces[0]
        await client.setCurrentSpace(space.did())
      }

      return client
    })()
  }

  return clientPromise
}

export async function uploadToIPFS(blob) {
  try {
    const client = await getClient()

    const file = new File([blob], 'encrypted-file')

    const cid = await client.uploadFile(file)

    return cid.toString()
  } catch (error) {
    throw error
  }
}

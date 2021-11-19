async function getData (req) {
  const params = {
    param1: req.data,
    param2: 'param2'
  }
  const request = await getData(params)
}

async function setData (req) {
  const params = {
    param1: req.data,
    param2: 'param2'
  }
  const request = await setData(params)
}

module.exports = {
  getData,
  setData
}

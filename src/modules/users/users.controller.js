import usersService from './users.service.js'

export async function getMe (req, res, next) {
  try {
    const user = await usersService.getById(req.user.id)
    res.json({ user })
  } catch (err) {
    next(err)
  }
}

export async function updateMe (req, res, next) {
  try {
    const user = await usersService.updateEmail(req.user.id, req.body.email)
    res.json({ user })
  } catch (err) {
    next(err)
  }
}

export async function deleteMe (req, res, next) {
  try {
    await usersService.remove(req.user.id)
    res.status(204).send()
  } catch (err) {
    next(err)
  }
}

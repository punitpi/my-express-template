export function toPublicUser (user) {
  return { id: user.id, email: user.email, createdAt: user.createdAt, updatedAt: user.updatedAt }
}

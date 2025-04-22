export const activeCardUpdatedSocket = (socket) => {
  socket.on('activeCardUpdate', (cardId) => {
    socket.broadcast.emit('activeCardUpdate', cardId)
  })
}
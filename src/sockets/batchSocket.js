export const batchSocket = (socket) => {
  socket.on('batch', (boardId) => {
    socket.broadcast.emit('batch', boardId.boardId)
  })
}

export const copyCardInSameBoardSocket = (socket) => {
  socket.on('copyCardInSameBoard', (boardId) => {
    socket.emit('copyCardInSameBoard', boardId.boardId)
  })
}
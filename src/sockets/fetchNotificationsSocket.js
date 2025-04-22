export const fetchNotificationsSocket = (socket) => {
  socket.on('FE_FETCH_NOTI', (userId) => {
    console.log('userId', userId)
    // Khi nhận được sự kiện FE_USER_INVITED_TO_BOARD từ client thì emit BE_USER_INVITED_TO_BOARD tới tất cả client
    socket.broadcast.emit('BE_FETCH_NOTI', userId)
  })
} 
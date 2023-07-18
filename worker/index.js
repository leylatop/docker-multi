const keys = request('./keys')
const redis = require('redis')

// 创建一个 redis 客户端
const redisClient = redis.createClient({
  host: keys.redisHost,
  port: keys.redisPort,
  // retry_strategy 这个代码的意思是如果我们失去了连接，那么我们将等待 1000 毫秒后尝试重新连接。
  retry_strategy: () => 1000
})

// 创建一个 redis 客户端的副本的目的是为了避免在一个客户端上同时进行订阅和发布操作。
const sub = redisClient.duplicate()

// 计算斐波那契数列
function fib(index) {
  if(index < 2) return 1;
  return fib(index - 1) + fib(index - 2)
}

// 当 redis 客户端收到消息时，就会执行回调函数
sub.on('message', (channel, message) => {
  // 将计算结果存入 redis 中
  // hset 方法的意思是将 message 作为 key，计算结果作为 value 存入 redis 中。
  // hset 的第一个参数是要操作的 hash 的名称，第二个参数是要设置的 key，第三个参数是要设置的 value。
  redisClient.hset('values', message, fib(parseInt(message)))
})

// 订阅 redis 中的 insert 事件，这样当有用户访问 /values 路径时，就会将 index 发布到 redis 中的 insert 事件中，然后就会执行 sub.on('message') 中的回调函数。
sub.subscribe('insert')

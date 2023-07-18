const keys = require('./keys')
const express = require('express')
const bodyParser = require('body-parser')
const cors = require('cors')

const app = express()
// use(cors()) 的意思是允许任何域名的客户端访问我们的 api。
app.use(cors())
// use(bodyParser.json()) 的意思是将所有的请求转换为 json。
app.use(bodyParser.json())

// Poll 是一个 postgres 客户端，用于连接 postgres 数据库。
// postgres 数据库是一个关系型数据库，它的数据存储在表中，每个表有多个列，每个列有多个行。
const { Pool } = require('pg')
// 创建一个 postgres 客户端
const pgClient = new Pool({
  user: keys.pgUser,
  host: keys.pgHost,
  database: keys.pgDatabase,
  password: keys.pgPassword,
  port: keys.pgPort
})

// pg客户端的on方法的意思是当 pg 客户端发生错误时，就会执行回调函数。
pgClient.on('error', () => console.log('Lost PG connection'))

// pg客户端创建一个表，表名为 values，列名为 number，类型为 int。
pgClient
  .query('CREATE TABLE IF NOT EXISTS values (number INT)')
  .catch(err => console.log(err))


const redis = require('redis')

// 在这里创建一个redis客户端
const redisClient = redis.createClient({
  host: keys.redisHost, 
  port: keys.redisPort,
  retry_strategy: () => 1000 // 如果我们失去了连接，那么我们将等待 1000 毫秒后尝试重新连接。
})

// redisPublisher 用于在用户访问 /values 路径时，将 index 发布到 redis 中的 insert 事件中
const redisPublisher = redisClient.duplicate()


app.get('/', (req, res) => {
  res.send('Hi')
})

app.get('/values/all', async (req, res) => {
  // 当客户端访问 /values/all 路径时，我们将返回values表中的所有数据。
  // 获取所有值时，从postgres中获取，是因为postgres是一个关系型数据库，它的数据存储在硬盘中，所以获取速度比较慢。
  const values = await pgClient.query('SELECT * from values')
  res.send(values.rows)
})

app.get('/values/current', async (req, res) => {
  // 当客户端访问 /values/current 路径时，我们将返回redis的valus哈希表中的所有数据。
  // values哈希表中的数据是在worker/index.js中计算出来的
  // 获取当前值时，从redis中获取，是因为redis是一个内存数据库，它的数据存储在内存中，所以获取速度很快。
  redisClient.hgetall('values', (err, values) => {
    res.send(values)
  })
})

app.post('/values', async (req, res) => {
  const index = req.body.index
  if(index > 40) {
    return res.status(422).send('Index too high')
  }
  // 将 index 存入 redis 中的 values 哈希表中，相当于存储在了内存中
  redisClient.hset('values', index, 'Nothing yet!')

  // 将 index 发布到 redis 中的 insert 事件中，这样 worker/index.js 就可以收到这个事件了，然后就可以计算斐波那契数列，然后将结果存入 redis 中。
  redisPublisher.publish('insert', index)

  // 将 index 存入 postgres 中的 values 表中，相当于存储在了硬盘中
  pgClient.query('INSERT INTO values(number) VALUES($1)', [index])

  res.send({ working: true })
})

app.listen(5000, err => {
  console.log('Listening')
})  // 监听5000端口

// 为什么我们要使用两个 redis 客户端？
// 因为我们在一个客户端上同时进行订阅和发布操作是不允许的。
// 为什么我们要使用redis + postgres同时存储数据？
// 因为 redis 是一个内存数据库，它的数据存储在内存中，当我们重启一个 redis 客户端时，它的数据就会丢失。
// 而 postgres 是一个关系型数据库，它的数据存储在硬盘中，当我们重启一个 postgres 客户端时，它的数据不会丢失。
// 所以我们使用 redis + postgres 来存储数据，当我们重启一个 redis 客户端时，我们可以从 postgres 中恢复数据。
// redis 和 postgres 之间的数据同步是通过 worker/index.js 来实现的。
// 从postgres 中获取所有值时，是什么时候进行斐波那契数列的计算的？
// 当我们访问 /values/all 路径时，我们会从 postgres 中获取所有值，然后返回给客户端。



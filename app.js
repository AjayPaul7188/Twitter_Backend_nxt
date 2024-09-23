const express = require("express");
const app = express();
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
app.use(express.json());
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const dpPath = path.join(__dirname, "twitterClone.db");

let db = null;

initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dpPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server is running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`Db Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

const JWT_SECRET = "MY_TOKEN";

const authenticateToken = (req, res, next) => {
  let token;
  const authHeader = req.headers["authorization"];
  if (authHeader !== undefined) {
    token = authHeader.split(" ")[1];
  }

  if (token === undefined) {
    res.status(401).send("Invalid JWT Token");
  } else {
    jwt.verify(token, JWT_SECRET, (error, payload) => {
      if (error) {
        res.status(401).send("Invalid JWT Token");
      } else {
        req.username = payload.username;
        req.user_id = payload.id;
        next();
      }
    });
  }
};

//API1
app.post("/register", async (req, res) => {
  const { username, password, name, gender } = req.body;

  //   console.log(await db.all("select * from user;"));

  // await db.run(`delete from user where username='${username}';`);

  const hashedPassword = await bcrypt.hash(password, 10);
  try {
    const selectUserQuery = `select * from user where username = '${username}';`;
    const dbUser = await db.get(selectUserQuery);
    if (dbUser === undefined && password.length > 5) {
      const createUserQuery = `
                insert into
                user(name, username, password, gender)
                values(
                    '${name}',
                    '${username}',
                    '${hashedPassword}',
                    '${gender}');`;
      const dbResponse = await db.run(createUserQuery);
      res.send("User created successfully");
    } else if (password.length < 6) {
      res.status(400).send("Password is too short");
    } else if (dbUser.username === username) {
      res.status(400).send("User already exists");
    } else {
      console.log("nothing");
    }
  } catch (error) {
    console.log(error);
  }
});

//API2
app.post("/login", async (req, res) => {
  const { username, password } = req.body;

  try {
    const getUserQuery = `select * from user where username='${username}';`;
    const dbUser = await db.get(getUserQuery);
    // console.log(dbUser);
    if (dbUser === undefined) {
      res.status(400).send("Invalid user");
    } else {
      const isMatched = await bcrypt.compare(password, dbUser.password);
      if (isMatched === true) {
        const token = jwt.sign(
          { id: dbUser.user_id, username: dbUser.username },
          JWT_SECRET
        );

        res.json({ jwtToken: token });
        console.log(token);
      } else {
        res.status(400).send("Invalid password");
      }
    }
  } catch (error) {
    res.send(error.message);
  }
});

//API3
app.get("/user/tweets/feed", authenticateToken, async (req, res) => {
  let { username } = req;
  try {
    const getUserQuery = `select user.username, tweet.tweet, tweet.date_time as dateTime
       from (follower
       inner join tweet
       on follower.follower_user_id=tweet.user_id) as T
       inner join user
       on T.user_id=user.user_id
       where user.user_id in (select follower.following_user_id
        from user
       inner join follower
       on user.user_id=follower.follower_user_id
       where user.username='${username}')
       group by
       tweet.tweet_id
       order by tweet.date_time desc
       limit 4
       ;`;
    const dbUser = await db.all(getUserQuery);

    // console.log(await db.all(`select * from tweet`));

    res.send(dbUser);
  } catch (error) {
    res.send(error.message);
  }
});

//API4
app.get("/user/following/", authenticateToken, async (req, res) => {
  let { username } = req;
  try {
    const getNamesQuery = `select name
        from user
        where user_id in (select follower.following_user_id
            from follower
            inner join user
            on follower.follower_user_id=user.user_id
            where user.username='${username}');`;

    const allNames = await db.all(getNamesQuery);
    res.send(allNames);
  } catch (error) {
    res.send(error.message);
  }
});

//API5
app.get("/user/followers", authenticateToken, async (req, res) => {
  let { username } = req;
  try {
    const getFollowersQuery = `select name
        from user
        where user_id in (select follower.follower_user_id
            from follower
            inner join user
            on follower.following_user_id=user.user_id
            where user.username='${username}');`;

    const followersNames = await db.all(getFollowersQuery);
    res.send(followersNames);
  } catch (error) {
    res.send(error.message);
  }
});

//API6
app.get("/tweets/:tweetId", authenticateToken, async (req, res) => {
  let { username } = req;
  const tweetId = req.params.tweetId;
  try {
    const getTweetsQuery = `select tweet.tweet, (select count(*)
      from like where tweet_id='${tweetId}') as likes, (select count(*)
      from reply where tweet_id='${tweetId}') as replies, tweet.date_time as dateTime
      from tweet
      where tweet.user_id in (select follower.following_user_id
        from follower
        inner join user
        on follower.follower_user_id=user.user_id
        where user.username = '${username}')
        group by
        tweet.tweet
        having
        tweet.tweet_id='${tweetId}';`;

    const tweets = await db.get(getTweetsQuery);
    if (tweets === undefined) {
      res.status(401).send("Invalid Request");
    } else {
      res.send(tweets);
    }
  } catch (error) {
    res.send(error.message);
  }
});

// API7
app.get("/tweets/:tweetId/likes/", authenticateToken, async (req, res) => {
  let { username } = req;
  const { tweetId } = req.params;
  //   console.log(await db.all("select * from like;"));

  try {
    const getNamesOfLiked = `select distinct user.username
        from user
        inner join like
        on user.user_id=like.user_id
        inner join tweet
        on like.user_id=tweet.user_id
        where like.tweet_id='${tweetId}'
        and '${tweetId}' in (select tweet.tweet_id
          from tweet
          where tweet.user_id in (select follower.following_user_id
        from follower
        inner join user
        on follower.follower_user_id=user.user_id
        where user.username = '${username}'));`;

    const namesOfLiked = await db.all(getNamesOfLiked);

    if (namesOfLiked.length === 0) {
      res.status(401).send("Invalid Request");
    } else {
      let likesList = [];
      for (let i of namesOfLiked) {
        likesList.push(i.username);
      }
      res.json({ likes: likesList });
    }
  } catch (error) {
    res.send(error.message);
  }
});

//API8
app.get("/tweets/:tweetId/replies/", authenticateToken, async (req, res) => {
  let { username } = req;
  const { tweetId } = req.params;

  try {
    const getRepliesQuery = `select user.name, reply.reply
        from user
        inner join reply
        on user.user_id=reply.user_id
        where tweet_id='${tweetId}'
        and reply.user_id in (select follower.following_user_id
        from follower
        inner join user
        on follower.follower_user_id=user.user_id
        where user.username = '${username}');`;

    const replies = await db.all(getRepliesQuery);
    if (replies.length === 0) {
      res.status(401).send("Invalid Request");
    } else {
      res.json({ replies: replies });
    }
  } catch (error) {
    res.send(error.message);
  }
});

//API9
app.get("/user/tweets/", authenticateToken, async (req, res) => {
  let { user_id } = req;
  try {
    const getTweetsQuery = `select tweet.tweet, (
        select count(*) from like
        where tweet_id in (select tweet_id from tweet
            where user_id='${user_id}')) as likes, (
        select count(*) from reply
        where tweet_id in (select tweet_id from tweet
            where user_id='${user_id}')) as replies, 
        tweet.date_time as dateTime
        from tweet
        where user_id='${user_id}'
        order by
        tweet.date_time desc;`;

    const tweets = await db.all(getTweetsQuery);
    res.send(tweets);
  } catch (error) {
    res.send(error.message);
  }
});

//API10
app.post("/user/tweets/", authenticateToken, async (req, res) => {
  let { user_id } = req;
  const { tweet } = req.body;

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();
  const currentDateTime = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;

  try {
    const postTweetQuery = `insert into tweet (tweet, user_id, date_time)
      values (
          '${tweet}',
          '${user_id}',
          '${currentDateTime}'
      );`;

    const dbResponse = await db.run(postTweetQuery);
    res.send("Created a Tweet");
  } catch (error) {
    res.send(error.message);
  }
});

//API11
app.delete("/tweets/:tweetId/", authenticateToken, async (req, res) => {
  let { user_id } = req;
  const { tweetId } = req.params;
  try {
    const deleteTweetQuery = `delete from tweet
        where tweet_id='${tweetId}' and user_id='${user_id}';`;

    const dbResponse = await db.run(deleteTweetQuery);
    if (dbResponse.changes === 0) {
      res.status(401).send("Invalid Request");
    } else {
      res.send("Tweet Removed");
    }

    // console.log(await db.all("select * from tweet;"));
  } catch (error) {
    res.send(error.message);
  }
});

module.exports = app;

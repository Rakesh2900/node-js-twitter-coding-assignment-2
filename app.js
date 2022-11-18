const express = require("express");
const path = require("path");

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

const app = express();
app.use(express.json());
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

let db = null;

const dbPath = path.join(__dirname, "twitterClone.db");

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

//API 1

app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;

  const selectUserQuery = `
    SELECT * FROM user WHERE username = '${username}'`;

  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    const hashedPassword = await bcrypt.hash(request.body.password, 10);
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const registerUserQuery = `
            INSERT INTO
                user(username, password, name, gender)
            VALUES(
                '${username}',
                '${hashedPassword}',
                '${name}',
                '${gender}'
            );`;

      await db.run(registerUserQuery);
      response.status(200);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//API 2

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;

  const selectUserQuery = `
    SELECT * FROM user WHERE username = '${username}'`;

  const dbUser = await db.get(selectUserQuery);

  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, "secret24");
      response.send({ jwtToken });
      console.log(jwtToken);
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//Authentication

const authenticateToken = (request, response, next) => {
  let jwtToken;

  const authHeader = request.headers["authorization"];

  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }

  if (jwtToken === undefined) {
    response.status(401);
    // response.send("jwtToken not provided");
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "secret24", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

//API 3

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username } = request;
  const loggedInUserQuery = `
    SELECT
        user_id
    FROM
        user
    WHERE
        username = '${username}'`;

  const loggedInUserObj = await db.get(loggedInUserQuery);
  console.log(loggedInUserObj);

  const api3Query = `
    SELECT
        user.username,
        tweet.tweet,
        tweet.date_time AS dateTime
    FROM 
        follower
    INNER JOIN 
        tweet
    ON 
        follower.following_user_id = tweet.user_id
    INNER JOIN 
        user 
    ON 
        user.user_id = tweet.user_id  
    WHERE 
        follower.follower_user_id = '${loggedInUserObj.user_id}'
    ORDER BY 
        tweet.date_time DESC
    LIMIT 
        4;`;

  const api3Result = await db.all(api3Query);
  response.send(api3Result);
});

//API 4

app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username } = request;
  const loggedInUserQuery = `
    SELECT
        user_id
    FROM
        user
    WHERE
        username = '${username}'`;

  const loggedInUserObj = await db.get(loggedInUserQuery);

  const api4Query = `
    SELECT
        DISTINCT(user.name)
    FROM
        user
    INNER JOIN 
        follower
    ON
        user.user_id = follower.following_user_id
    WHERE
        follower.follower_user_id = ${loggedInUserObj.user_id};`;

  const api4Result = await db.all(api4Query);
  response.send(api4Result);
});

//API 5

app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username } = request;
  const loggedInUserQuery = `
    SELECT
        user_id
    FROM
        user
    WHERE
        username = '${username}'`;

  const loggedInUserObj = await db.get(loggedInUserQuery);

  const api5Query = `
    SELECT
        DISTINCT(user.name)
    FROM 
        user
    INNER JOIN 
        follower
    ON 
        user.user_id = follower.follower_user_id
    WHERE 
        follower.following_user_id = ${loggedInUserObj.user_id};`;

  const api5Result = await db.all(api5Query);
  response.send(api5Result);
});

//API 6

app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { username } = request;
  const { tweetId } = request.params;

  const loggedInUserQuery = `
    SELECT
        user_id
    FROM
        user
    WHERE
        username = '${username}'`;

  const loggedInUserObj = await db.get(loggedInUserQuery);

  const tweetsQuery = `
    SELECT * FROM 
        tweet
    WHERE 
        tweet_id = ${tweetId};`;

  const tweetResult = await db.all(tweetsQuery);

  const userFollowersQuery = `
    SELECT
        *
    FROM 
        follower
    INNER JOIN 
        user    
    ON     
        follower.following_user_id = user.user_id
    WHERE 
        follower.follower_user_id = ${loggedInUserObj.user_id};`;

  const userFollowers = await db.all(userFollowersQuery);

  userFollowers.forEach((item) => console.log(item));
  console.log(tweetResult);

  if (
    userFollowers.some((item) => item.following_user_id === tweetResult.user_id)
  ) {
    const api6Query = `
    SELECT 
        tweet.tweet,
        COUNT(like_id) AS likes,
        COUNT(like_id) AS replies,
        date_time AS dateTime
    FROM 
        tweet
    INNER JOIN 
        like 
    ON
        tweet.tweet_id = like.tweet_id
    INNER JOIN 
        reply
    ON 
        tweet.tweet_id = reply.tweet_id
    GROUP BY 
        like.like_id,
        reply.reply_id;`;

    const api6Result = await db.get(api6Query);
    response.send(api6Result);
  } else {
    response.send("Invalid Request");
    response.status(401);
  }
});

//API 7

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;
    const loggedInUserQuery = `
    SELECT
        user_id
    FROM
        user
    WHERE
        username = '${username}'`;
    const loggedInUserObj = await db.get(loggedInUserQuery);
    const likes_array = [];
    const api7Query = `
    SELECT
        DISTINCT(user.username) 
    FROM 
        follower
    INNER JOIN 
        tweet
    ON 
        follower.following_user_id = tweet.user_id
    INNER JOIN 
        like 
    ON  
        tweet.tweet_id = like.tweet_id
    INNER JOIN 
        user
    ON 
        user.user_id = like.user_id
    WHERE
        follower.follower_user_id = ${loggedInUserObj.user_id};`;
    const api7Result = await db.all(api7Query);
    api7Result.map((eachUsername) => {
      likes_array.push(eachUsername.username);
    });
    response.send(api7Result);
  }
);

//API 8

app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;
    const loggedInUserQuery = `
    SELECT
        user_id
    FROM
        user
    WHERE
        username = '${username}'`;
    const loggedInUserObj = await db.get(loggedInUserQuery);
    const replies_array = [];
    const api7Query = `
    SELECT
        DISTINCT(user.username) 
    FROM 
        follower
    INNER JOIN 
        tweet
    ON 
        follower.following_user_id = tweet.user_id
    INNER JOIN 
        reply 
    ON  
        tweet.tweet_id = reply.tweet_id
    INNER JOIN 
        user
    ON 
        user.user_id = reply.user_id
    WHERE
        follower.follower_user_id = ${loggedInUserObj.user_id};`;
    const api7Result = await db.all(api7Query);
    api7Result.map((eachUsername) => {
      replies_array.push(eachUsername.username);
    });
    response.send(api7Result);
  }
);

//API 9

app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const api9Query = `
    SELECT
        tweet,
        COUNT(*) AS likes,
        tweet.date_time AS dateTime
    FROM 
        (user
    INNER JOIN 
        tweet
    ON 
        user.user_id = tweet.user_id) AS T
    INNER JOIN 
        like
    ON 
        T.user_id = like.user_id
    GROUP BY 
        like_id;`;
  const api9Result = await db.all(api9Query);
  response.send(api9Result);
});

//API 10
app.post("/user/tweets/", async (request, response) => {
  const { tweet } = request.body;
  const api10Query = `
    INSERT INTO
        tweet(tweet)
    VALUES(
        '${tweet}'
        );`;
  await db.run(api10Query);
  response.send("Created a Tweet");
});

//API 11

app.delete("/tweets/:tweetId/", async (request, response) => {
  const { tweet } = request.body;
  const api10Query = `
    INSERT INTO
        tweet(tweet)
    VALUES(
        '${tweet}'
        );`;
  await db.run(api10Query);
  response.send("Tweet Removed");
});

module.exports = app;

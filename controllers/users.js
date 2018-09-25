const users = require('collections-online/lib/controllers/users');
const kbhStatsApi = require('../services/kbh-billeder-stats-api');
const config = require('collections-online/shared/config');


users.renderProfile = async (req, res) => {
  if (!req.user) {
    res.redirect('/');
    return;
  }

  const {user} = req;

  let points = kbhStatsApi.userPoints(user.id);
  let stats = kbhStatsApi.userStats(user.id);

  try {
    [points, stats] = [await points, await stats];
  } catch(err) {
    console.log(err);
  }

  res.render('profile' + (config.features.oldProfilePage ? '' : '2'), {points , stats, user});
}

module.exports = users;

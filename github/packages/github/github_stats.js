// jshint esversion: 9

/**
 * @description View repository community statistics
 * @param {ParamsType} params list of command parameters
 * @param {?string} commandText text message
 * @param {!object} [secrets = {}] list of secrets
 * @return {Promise<SlackBodyType>} Response body
 */
async function _command(params, commandText, secrets = {}) {
  let {github_token: githubToken, github_repos: githubRepos = ''} = secrets;
  githubRepos = params.repo ? params.repo : githubRepos;

  if (!githubRepos) {
    return {
      response_type: 'ephemeral',
      text:
        'Either pass a repo name or create a secret named `github_default_repo` to avoid passing the repository.'
    };
  }

  githubRepos = githubRepos.split(',').map(repo => repo.trim());

  const result = [];

  const tokenMessage = githubToken
    ? ''
    : 'For greater limits, create a secret named `github_token` with a <https://help.github.com/en/github/authenticating-to-github/creating-a-personal-access-token-for-the-command-line|GitHub token> using `/nc secret_create`.';

  try {
    const axios = require('axios');
    const networkRequests = [];
    for (const repo of githubRepos) {
      const url = `https://api.github.com/repos/${repo}`;
      networkRequests.push(
        axios({
          method: 'GET',
          url: url,
          headers: githubToken
            ? {
                Authorization: `Bearer ${githubToken}`,
                'Content-Type': 'application/json'
              }
            : {}
        })
      );
    }

    const responses = await Promise.all(networkRequests);

    for (const response of responses) {
      const {data, headers} = response;
      const requestThreshold = 3;
      const currReading = parseInt(headers['x-ratelimit-remaining']);
      const body = [
        `Stars: ${data.stargazers_count}`,
        `Forks: ${data.forks}`,
        `Open Issues: ${data.open_issues_count}`,
        `Watchers: ${data.subscribers_count}`,
        `Contributors: ${data.network_count}`,
        `Default Branch: ${data.default_branch}`,
        `Most used langauge: ${data.language === null ? 'None' : data.language}`
      ];
      result.push({
        color: 'good',
        text: body.join('\n'),
        title: `<${data.html_url}|${data.full_name}> statistics`,
        pretext:
          currReading < requestThreshold
            ? `:warning: *You are about to reach the api rate limit.* ${tokenMessage}`
            : null
      });
    }
  } catch (error) {
    if (error.response && error.response.status === 403) {
      result.push({
        color: 'danger',
        text: `:warning: *The api rate limit has been exhausted.* ${tokenMessage}`
      });
    } else if (error.response && error.response.status === 404) {
      result.push({
        color: 'danger',
        text: `Repository not found: <https://github.com/${repo}|${repo}>.`
      });
    } else if (error.response && error.response.status) {
      result.push({
        color: 'danger',
        text: `Error: ${error.response.status} ${error.response.data.message}`
      });
    } else {
      result.push({color: 'danger', text: `Error: ${JSON.stringify(error)}`});
    }
  }

  return {
    response_type: 'in_channel',
    attachments: result
  };
}

/**
 * @typedef {object} SlackBodyType
 * @property {string} text
 * @property {'in_channel'|'ephemeral'} [response_type]
 */
const main = async args => ({
  body: await _command(
    args.params,
    args.commandText,
    args.__secrets || {}
  ).catch(error => ({
    response_type: 'ephemeral',
    text: `Error: ${error.message}`
  }))
});
module.exports = main;

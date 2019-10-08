import { getAllLanguages } from '../../languages';
import { BUCKET_NAME } from '../../db.js';
import { parseBatchResults } from '../api-result-parser';
import { authedCreateReadAndWrite, authedReadAndWrite } from '../permissions';
import hash from '../../hash';

const NAME = 'Sentences_Meta';
const PREFIX = NAME + '_';
const USER_PREFIX = PREFIX + 'UserVote_';
const USER_DATE_PREFIX = PREFIX + 'UserVoteDate_';

const VALID = true;
const INVALID = false;

// Two out of three votes need to be say the sentence is valid
// for it to be approved.
const APPROVAL_MIN_VALID_VOTES = 2;
const APPROVAL_MIN_TOTAL_VOTES = 3;

export default class SentencesMeta {
  constructor(kintoServer, username) {
    this.server = kintoServer;
    this.username = username;
  }

  getCollectionName(code) {
    return PREFIX + code;
  }

  getUserKey(username) {
    return USER_PREFIX + username;
  }

  getUserDateKey(username) {
    return USER_DATE_PREFIX + username;
  }

  getPreparedRecord({ sentence, reviewed, source }) {
    const preparedRecord = {
      id: hash(sentence),
      sentence,
      source,
      valid: [],
      invalid: [],
      username: this.username,
      createdAt: Date.now(),
    };

    if (reviewed) {
      preparedRecord.valid = [this.username];
      preparedRecord[`${USER_PREFIX}${this.username}`] = true;
    }

    return preparedRecord;
  }

  async deleteSentenceRecords(bucket) {
    const languages = getAllLanguages();
    for (const language of languages) {
      const records = await this.getAllPaginated(language.code);
      const collectionName = await this.getCollectionName(language.code);
      console.log(`Found ${records.length} records to delete for ${language.code}`);
      await bucket.batch(b => {
        for (let i = 0; i < records.length; i++) {
          b.collection(collectionName).deleteRecord(records[i].id);
        }
      });
    }
  }

  async deleteSpecificSentenceRecords(bucket, locale, username) {
    const collectionName = await this.getCollectionName(locale);
    const records = await this.getAllUnapprovedByUsername(locale, username);
    const minifiedRecords = records.map((record) => ({ id: record.id, sentence: record.sentence }));
    console.log(`Found ${minifiedRecords.length} records to delete for ${locale} with username ${username}`);
    await bucket.batch(b => {
      for (let i = 0; i < minifiedRecords.length; i++) {
        console.log('Deleting', minifiedRecords[i]);
        b.collection(collectionName).deleteRecord(minifiedRecords[i].id);
      }
    });
  }

  async forceDeleteSentences(bucket, locale, sentences) {
    const collectionName = await this.getCollectionName(locale);
    const records = await this.getAllPaginated(locale);
    const minifiedRecords = records.map((record) => ({ id: record.id, sentence: record.sentence }));
    const { foundSentences, errorSentences } = sentences.reduce((acc, sentence) => {
      const foundSentence = minifiedRecords.find((record) => record.sentence === sentence);
      if (!foundSentence) {
        acc.errorSentences.push(sentence);
        return acc;
      }

      acc.foundSentences.push(foundSentence);
      return acc;
    }, { foundSentences: [], errorSentences: [] });
    console.log(`Found ${foundSentences.length} records to delete for ${locale}`);

    await bucket.batch(b => {
      for (let i = 0; i < foundSentences.length; i++) {
        console.log('Deleting', foundSentences[i]);
        b.collection(collectionName).deleteRecord(foundSentences[i].id);
      }
    });

    console.log('All deleted, except the following sentences which could not be found:');
    errorSentences.forEach((sentence) => console.error(sentence));
  }

  async forceDeleteSpecificSentenceRecords(bucket, locale, username) {
    const collectionName = await this.getCollectionName(locale);
    const records = await this.getAllByUsername(locale, username);
    const minifiedRecords = records.map((record) => ({ id: record.id, sentence: record.sentence }));
    console.log(`Found ${minifiedRecords.length} records to delete for ${locale} with username ${username}`);
    await bucket.batch(b => {
      for (let i = 0; i < minifiedRecords.length; i++) {
        console.log('Deleting', minifiedRecords[i]);
        b.collection(collectionName).deleteRecord(minifiedRecords[i].id);
      }
    });
  }

  async correctApprovals(locale) {
    const collection = await this.getCollection(locale);
    const records = await this.getAllPaginated(locale);
    console.log(`Found ${records.length} records to analyze for ${locale}`);

    const adjustedSentences = records.map((record) => {
      const isApproved = this.checkIfApproved(record);
      if (typeof isApproved === 'undefined' || isApproved === record.approved) {
        // nothing to do here
        return;
      }

      record.approved = isApproved;
      record.approvalDate = Date.now();

      return record;
    }).filter(Boolean);

    console.log(`Found ${adjustedSentences.length} to adjust`);

    const results = await collection.batch(c => {
      adjustedSentences.forEach(record => {
        c.updateRecord(record, {
          safe: true,
          last_modified: record.last_modified,
        });
      });
    });

    const adjustedResults = [];
    const errors = [];
    results.forEach(result => {
      if (result.status === 200) {
        adjustedResults.push(result.body.data);
      } else {
        console.error('Approval adjustment error', result.status, result.body);
        errors.push(result);
      }
    });

    if (adjustedResults.length > 0) {
      console.log('All approvals adjusted:');
      console.log(`Updated ${adjustedResults.length} records`);
    }

    if (errors.length > 0) {
      console.log(`Errors updating ${errors.length} records!`);
    }
  }

  async deleteVotes(locale, username, approvalOnly) {
    const collection = await this.getCollection(locale);
    const records = await this.getAllPaginated(locale);

    const foundSentences = records.filter((record) => {
      return record.valid.includes(username) || record.invalid.includes(username);
    });

    console.log(`Found ${foundSentences.length} to analyze`);

    const adjustedSentences = foundSentences.map((record) => {
      if (approvalOnly && !record.valid.includes(username)) {
        // Nothing to do for this sentence as there is no approval
        return;
      }

      if (record.valid.includes(username)) {
        const index = record.valid.indexOf(username);
        record.valid.splice(index, 1);
        delete record[`Sentences_Meta_UserVote_${username}`];
        delete record[`Sentences_Meta_UserVoteDate_${username}`];
      }

      if (!approvalOnly && record.invalid.includes(username)) {
        const index = record.invalid.indexOf(username);
        record.invalid.splice(index, 1);
        delete record[`Sentences_Meta_UserVote_${username}`];
        delete record[`Sentences_Meta_UserVoteDate_${username}`];
      }

      // Given that we manipulate votes, we need to re-write the
      // approval.
      const isApproved = this.checkIfApproved(record);
      if (typeof isApproved === 'undefined') {
        delete record.approved;
        delete record.approvalDate;
      } else {
        record.approved = isApproved;
        record.approvalDate = Date.now();
      }

      return record;
    }).filter(Boolean);

    console.log(`Found ${adjustedSentences.length} records to delete votes in ${locale} for ${username}`);

    if (adjustedSentences.length === 0) {
      return;
    }

    const results = await collection.batch(c => {
      adjustedSentences.forEach(record => {
        c.updateRecord(record, {
          safe: true,
          last_modified: record.last_modified,
        });
      });
    });

    const adjustedResults = [];
    const errors = [];
    results.forEach(result => {
      if (result.status === 200 || result === 201) {
        adjustedResults.push(result.body.data);
      } else {
        console.error('Voting deletion error', result.status, result.body);
        errors.push(result);
      }
    });

    console.log('All votes adjusted:');
    console.log(`Updated ${adjustedResults.length} records`);
    console.log(`Errors updating ${errors.length} records!`);
  }

  async createAllCollections(bucket) {
    const languages = getAllLanguages();
    const results = await bucket.batch(b => {
      for (let i = 0; i < languages.length; i++) {
        const code = languages[i].code;
        const name = this.getCollectionName(code);
        b.createCollection(name, authedCreateReadAndWrite());
      }
    });

    const { successes, errors } = parseBatchResults(results);
    if (errors.length > 0) {
      throw new Error('Failed: create meta collections' + errors.join(','));
    }
    if (successes.length !== languages.length) {
      throw new Error('Failed: missing meta collections');
    }
  }

  async getLanguages(bucket) {
    const result = await this.getLanguageTables(bucket);
    return result.map(c => c.replace(PREFIX, ''));
  }

  async getLanguageTableNames(bucket) {
    const result = await bucket.listCollections({
      filters: {
        like_id: PREFIX,
      },
    });
    return result.data.map(c => c.id);
  }

  async getCollection(language) {
    return this.server.bucket(BUCKET_NAME)
      .collection(this.getCollectionName(language));
  }

  async getAll(language) {
    const collection = await this.getCollection(language);
    const result = await collection.listRecords();
    return result.data;
  }

  async getAllPaginated(language, filters = {}) {
    const collection = await this.getCollection(language);

    let { data, hasNextPage, next } = await collection.listRecords(filters);
    while (hasNextPage) {
      const result = await next();
      data = data.concat(result.data);
      hasNextPage = result.hasNextPage;
      next = result.next;
    }

    return data;
  }

  getAllRejectedByUsername(languages, username) {
    const promises = languages.map((language) => this.getAllUnapprovedByUsername(language, username));

    return Promise.all(promises)
      .then((unapprovedPerLanguage) => {
        return unapprovedPerLanguage.reduce((rejectedSentences, unapproved, index) => {
          if (unapproved && unapproved.length > 0) {
            // we can use the index here, as Promise.all guarantees that its
            // resolved values will be in the same order
            rejectedSentences[languages[index]] = unapproved;
          }

          return rejectedSentences;
        }, {});
      });
  }

  async getAllUnapprovedByUsername(language, username) {
    const collection = await this.getCollection(language);
    const filters = {
      username,
      approved: false,
    };
    const result = await collection.listRecords({ filters });
    const unapprovedSentencesWithoutDetail = result.data.map((record) => record.sentence);
    return unapprovedSentencesWithoutDetail;
  }

  async getAllByUsername(language, username) {
    const filters = {
      username,
    };

    return this.getAllPaginated(language, filters);
  }

  async getLanguageAndSentenceCounts(bucket) {
    const languages = await this.getLanguageTableNames(bucket);

    const responses = await this.server.batch((batch) => {
      for (const cid of languages) {
        batch.collection(cid).getTotalRecords();
      }
    }, { bucket: "App" });

    return responses.reduce((info, response) => {
      let numberOfSentences = 0;
      try {
        numberOfSentences = parseInt(response.headers['Total-Records'], 10);
      } catch (err) { /* ignore */ }

      info.sentences = info.sentences + numberOfSentences;

      if (numberOfSentences > 0) {
        info.languages = info.languages + 1;
      }

      return info;
    }, { languages: 0, sentences: 0 });
  }

  async getNotVoted(language) {
    const filters = {};
    // filter current user from votes.
    filters['has_' + this.getUserKey(this.username)] = false;
    filters['has_approved'] = false;
    const collection = await this.getCollection(language);
    const result = await collection.listRecords({ filters, sort: 'createdAt' });
    const sentences = result.data;
    // This works as all modern browsers use a stable sorting algorithm
    // if not, we're still fine..
    // We always want to show sentences with more valid votes first
    const additionallySortedByApprovalVotes = sentences.sort((a, b) => {
      const aVoteLength = a.valid.length;
      const bVoteLength = b.valid.length;

      return bVoteLength - aVoteLength;
    });

    return additionallySortedByApprovalVotes;
  }

  async getValidatedSentences(language) {
    const filters = {};
    filters.approved = true;
    const collection = await this.getCollection(language);
    const result = await collection.listRecords({ filters });
    return result.data;
  }

  async getAllValidatedSentences(language) {
    const filters = {};
    filters.approved = true;

    const allRecords = await this.getAllPaginated(language, filters);
    const approvedRecords = allRecords.filter((record) => this.checkIfApproved(record));

    return approvedRecords;
  }

  prepareForSubmission(sentences) {
    const allUnreviewedSentences = sentences.unreviewed.map((sentence) => {
      return { sentence, reviewed: false };
    });

    const allValidatedSentences = sentences.validated.map((sentence) => {
      return { sentence, reviewed: true };
    });

    return allUnreviewedSentences.concat(allValidatedSentences);
  }

  async submitSentences(language, sentences, source = '') {
    const allSentences = this.prepareForSubmission(sentences);
    const collection = await this.getCollection(language);
    const results = await collection.batch(batch => {
      for (let i = 0; i < allSentences.length; i++) {
        const record = this.getPreparedRecord({
          sentence: allSentences[i].sentence,
          reviewed: allSentences[i].reviewed,
          source,
        });
        batch.createRecord(record, {
          ...authedReadAndWrite(),
          safe: true,
        });
      }
    });

    const { successes, errors } = parseBatchResults(results);
    return {
      sentences: successes,
      errors,
    };
  }

  async getMyVotes(language) {
    const collection = await this.getCollection(language);
    const filters = {};
    filters['has_' + this.getUserKey(this.username)] = true;
    const result = await collection.listRecords({ filters });
    return result.data;
  }

  getVoteRecords(isValid, sentences, existing) {
    return sentences.map(sentence => {
      let record = existing[sentence.id] ?
        existing[sentence.id] : this.getPreparedRecord({
          sentence: sentence.sentence,
          reviewed: false,
        });
      if (isValid) {
        record.valid.push(this.username);
        record[this.getUserKey(this.username)] = VALID;
      } else {
        record.invalid.push(this.username);
        record[this.getUserKey(this.username)] = INVALID;
      }

      record[this.getUserDateKey(this.username)] = Date.now();

      const isApproved = this.checkIfApproved(record);
      if (typeof isApproved === 'undefined') {
        // We don't have any approval yet (not enough votes)
        // therefore we leave the record as is
        return record;
      }

      record.approved = isApproved;
      record.approvalDate = Date.now();

      return record;
    });
  }

  checkIfApproved(record) {
    const validVotes = record.valid.length;
    const invalidVotes = record.invalid.length;
    const totalVotes = validVotes + invalidVotes;

    if(validVotes >= APPROVAL_MIN_VALID_VOTES) {
      return true;
    } else if(totalVotes >= APPROVAL_MIN_TOTAL_VOTES) {
      return false;
    }

    return;
  }

  async vote(language, validated, invalidated) {
    const collection = await this.getCollection(language);
    const notVoted = await this.getNotVoted(language);
    const existing = notVoted.reduce((accum, record) => {
      accum[record.id] = record;
      return accum;
    }, {});

    const results = await collection.batch(c => {
      let updateRecords = [
        ...this.getVoteRecords(true, validated, existing),
        ...this.getVoteRecords(false, invalidated, existing),
      ];

      updateRecords.forEach(record => {
        c.updateRecord(record, {
          safe: true,
          last_modified: record.last_modified,
        });
      });
    });

    let votes = [];
    let errors = [];
    results.forEach(result => {
      if (result.status === 200 || result === 201) {
        votes.push(result.body.data);
      } else {
        console.error('vote error', result.status, result.body);
        errors.push(result);
      }
    });

    return {
      votes,
      errors,
    };
  }

  async count(language) {
    let collection = await this.getCollection(language);
    return collection.getTotalRecords();
  }

  async getAlreadyExistingSubset(language, sentences) {
    const idList = sentences.map(s => hash(s));
    const result = await this.getAll(language);
    const existingIDs = result.map((existingSentence) => existingSentence.id);

    const existingSubmittedSentencesIDs = idList.filter((id) => existingIDs.includes(id));
    return result.filter((existingSentence) => existingSubmittedSentencesIDs.includes(existingSentence.id));
  }

  async getMySentences(language) {
    const collection = await this.getCollection(language);
    const result = await collection.listRecords({
      filters: {
        username: this.username,
      },
    });
    return result.data;
  }
}

SentencesMeta.NAME = NAME;

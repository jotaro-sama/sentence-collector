import { connect } from 'react-redux';

import { addLanguage, removeLanguage } from '../actions';
import Profile from '../components/pages/profile';

function mapStateToProps(state) {
  return {
    username: state.app.username,
    password: state.app.password,
    languages: state.app.languages,
    pending: state.app.pendingLanguages,
  };
}

function mapDispatchToProps(dispatch) {
  return {
    addLanguage: (language) => dispatch(addLanguage(language)),
    removeLanguage: (language) => dispatch(removeLanguage(language)),
  };
}

export default connect(mapStateToProps, mapDispatchToProps)(Profile);

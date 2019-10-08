import React from 'react';

import '../../css/language-selector.css';
import {
  ENGLISH_CODE,
  getLanguages,
  getAllLanguages
} from '../../../shared/languages';

const LanguageSelector = (props) => (
  <select onChange={evt => props.onChange && props.onChange(evt.target.value)}
          disabled={props.disabled} value={props.selected} className='language-selector'>
    <Options {...props} />
  </select>
);

const Options = (props) => {
  let languages = props.only && props.only.length > 0 ?
    getLanguages(props.only) : getAllLanguages();

  // For convenience, move English to the top of the list since
  // for now the website is localized in English only.
  const englishLang = languages.find(lang => lang.code === ENGLISH_CODE);
  if (englishLang) {
    const englishIndex = languages.indexOf(englishLang);
    languages.splice(englishIndex, 1);
    languages.unshift(englishLang);
  }

  if (props.filters) {
    languages = languages.filter(
      ({ code }) => props.filters.indexOf(code) === -1);
  }

  if (languages.length === 1) {
    return <Option key="default" lang={languages[0]} />;
  }

  return [<NullOption key="null" />]
    .concat(languages.map(
      lang => <Option key={lang.code} lang={lang} />
    ));
};

const Option = (props) => (
  <option value={props.lang.code}>
    {`${props.lang.name} (${props.lang.nativeName})`}
  </option>
);

const NullOption = () => <option value="">--</option>;


export default LanguageSelector

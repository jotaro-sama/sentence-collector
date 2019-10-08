import React from 'react';

import ReviewLink from './review-link';
import SpinnerButton from './spinner-button';

class ConfirmForm extends React.Component {
  constructor(props) {
    super(props);

    this.state = {};
    this.onSubmit = this.onSubmit.bind(this);
    this.onReview = this.props.onReview.bind(this);
  }

  onSubmit(evt) {
    this.setState({
      pendingSentences: true,
    });

    this.props.onSubmit(evt);
  }

  render() {
    const {
      submitted,
      existing,
      invalidated,
      filtered,
      validated,
      unreviewed,
      readyCount,
    } = this.props;

    return (
      <form onSubmit={this.onSubmit}>
        <h2>Confirm New Sentences</h2>
        <p>
          {`${submitted.length} sentences found.`}
        </p>

        {(existing && existing.length > 0) && (
          <p>
            {`${existing.length} sentences were previously submitted.`}
          </p>
        )}

        {invalidated.length + filtered.length > 0 && (
          <p style={{color: 'red'}}>
            {
              `${filtered.length} sentences were not matching the requirements.` +
              (invalidated.length > 0 ?
                ` (${invalidated.length} more rejected by you) ` : '')
            }
          </p>
        )}

        {validated.length + invalidated.length > 0 && (
          <p>
            {`-- ${validated.length + invalidated.length}`} {}
            sentences are already reviewed. Great job!
          </p>
        )}

        <p><strong>{`${readyCount} sentences ready for submission!`}</strong></p>

        {unreviewed.length > 0 && (
          <p>
            {`-- ${unreviewed.length} of these sentences are unreviewed. If you want, you can also review your sentences now before submitting them.`}&nbsp;
            <ReviewLink onReview={this.onReview}
                        sentences={unreviewed} />
          </p>
        )}

        <section id="confirm-buttons">

          { this.state.pendingSentences ?
            <SpinnerButton></SpinnerButton> :
            <button type="submit" disabled={readyCount === 0}>Confirm</button>
          }

          { this.state.pendingSentences && (
            <div>
              <p className="loadingText">Sentences are being uploaded. This can take several minutes depending on the number of sentences added.
            Please don't close this website.
              </p>
            </div>
          )}

        </section>

        { Object.keys(filtered).length > 0 && (
          <section>
            <h2>Filtered sentences due to requirements failing (please submit fixed versions as new sentences):</h2>
            <p>Please check the <a href="https://common-voice.github.io/sentence-collector/#/how-to">guidelines</a>.</p>

            {
              Object.keys(filtered).map((filterKey) => (
                <React.Fragment key={'fragment-' + filterKey}>
                  <h3 key="{filterKey}">{ filterKey }</h3>
                  {
                    filtered[filterKey].map((filteredSentence) =>
                      <p key={filteredSentence}>{filteredSentence}</p>
                    )
                  }
                </React.Fragment>
              ))
            }
          </section>
        )}
      </form>
    );
  }
}

export default ConfirmForm;

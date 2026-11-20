<script>
// The event editor, with one addition (LGC-64): saving an occurrence of a
// repeating event asks "this one only, or this and all after?". Cancel leaves
// the form open and unsaved. The answer goes to the server as `_seriesScope`
// in the request body; modules/@apostrophecms/event/index.js acts on it.
import AposDocEditor from 'Modules/@apostrophecms/doc-type/components/AposDocEditor';

export default {
  extends: AposDocEditor,
  data() {
    return {
      seriesScope: null
    };
  },
  methods: {
    getRequestBody(options) {
      const body = AposDocEditor.methods.getRequestBody.call(this, options);
      if (this.seriesScope) {
        body._seriesScope = this.seriesScope;
      }
      return body;
    },
    async save(options) {
      this.seriesScope = null;
      // Only an existing occurrence that belongs to a series is asked about.
      if (this.currentId && this.original && this.original.eventGroupId) {
        const answer = await apos.confirm({
          heading: 'church:eventSeriesPromptHeading',
          description: 'church:eventSeriesPromptBody',
          affirmativeLabel: 'church:eventSeriesSave',
          negativeLabel: 'church:eventSeriesCancel',
          icon: false,
          form: {
            schema: [
              {
                name: 'scope',
                type: 'radio',
                label: 'church:eventSeriesScopeLabel',
                required: true,
                choices: [
                  {
                    label: 'church:eventSeriesThis',
                    value: 'this'
                  },
                  {
                    label: 'church:eventSeriesFollowing',
                    value: 'following'
                  }
                ]
              }
            ],
            value: {
              data: { scope: 'this' },
              hasErrors: false
            }
          }
        });
        // Cancel and Esc come back as false or null.
        if (!answer || !answer.data || !answer.data.scope) {
          return;
        }
        this.seriesScope = answer.data.scope;
      }
      return AposDocEditor.methods.save.call(this, options);
    }
  }
};
</script>

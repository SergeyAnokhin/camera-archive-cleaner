{{/* Base name */}}
{{- define "camera-cleaner.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/* Fully qualified app name */}}
{{- define "camera-cleaner.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name (include "camera-cleaner.name" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{/* Common labels */}}
{{- define "camera-cleaner.labels" -}}
app.kubernetes.io/name: {{ include "camera-cleaner.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end -}}

{{/* Per-component selector labels. Call with (dict "ctx" . "component" "backend") */}}
{{- define "camera-cleaner.selectorLabels" -}}
app.kubernetes.io/name: {{ include "camera-cleaner.name" .ctx }}
app.kubernetes.io/instance: {{ .ctx.Release.Name }}
app.kubernetes.io/component: {{ .component }}
{{- end -}}

{{/* Full image ref for a component: <registry>/<repository>:<tag> */}}
{{- define "camera-cleaner.image" -}}
{{- printf "%s/%s:%s" .ctx.Values.image.registry .img.repository (.img.tag | toString) -}}
{{- end -}}
